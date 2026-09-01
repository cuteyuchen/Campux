import { describe, expect, test } from "bun:test";
import {
  BotMessageInboxConsumer,
  buildBotMessageConversationKey,
  buildBotMessageEventKey,
  botMessageInboxRetryDelaysMs,
  parseBotMessageEventTime,
  retryDelayForAttempt,
  shouldPersistBotMessageEvent,
} from "./bot-message-inbox";

describe("bot message inbox identity", () => {
  test("uses message id, message type and peer for a stable event key", () => {
    const event = { post_type: "message", message_type: "private", user_id: 123, message_id: 9 };
    expect(buildBotMessageEventKey(event)).toBe("message:private:123:9");
    expect(buildBotMessageConversationKey(event)).toBe("private:123");
  });

  test("falls back to an order-independent payload hash when message id is absent", () => {
    const left = { post_type: "message", message_type: "group", group_id: 8, raw_message: "hello", time: 1 };
    const right = { time: 1, raw_message: "hello", group_id: 8, message_type: "group", post_type: "message" };
    expect(buildBotMessageEventKey(left)).toBe(buildBotMessageEventKey(right));
  });

  test("persists private messages and the configured review group only", () => {
    expect(shouldPersistBotMessageEvent({ post_type: "message", message_type: "private", user_id: 1 })).toBe(true);
    expect(shouldPersistBotMessageEvent({ post_type: "message", message_type: "group", group_id: 2 }, "2")).toBe(true);
    expect(shouldPersistBotMessageEvent({ post_type: "message", message_type: "group", group_id: 3 }, "2")).toBe(false);
    expect(shouldPersistBotMessageEvent({ post_type: "notice", message_type: "private", user_id: 1 })).toBe(false);
  });

  test("normalizes OneBot seconds timestamps and retry delays", () => {
    expect(parseBotMessageEventTime({ time: 1_700_000_000 }).getTime()).toBe(1_700_000_000_000);
    expect(botMessageInboxRetryDelaysMs).toEqual([5_000, 30_000, 120_000, 600_000, 1_800_000]);
    expect(retryDelayForAttempt(1)).toBe(5_000);
    expect(retryDelayForAttempt(5)).toBe(1_800_000);
    expect(retryDelayForAttempt(99)).toBe(1_800_000);
  });
});

describe("BotMessageInboxConsumer", () => {
  test("serializes one conversation and retries failures with a terminal state", async () => {
    const rows: any[] = [
      {
        id: "one",
        botAccountId: "bot",
        conversationKey: "private:1",
        rawEvent: { message_type: "private", user_id: 1 },
        status: "pending",
        attempts: 0,
        availableAt: new Date(0),
      },
      {
        id: "two",
        botAccountId: "bot",
        conversationKey: "private:1",
        rawEvent: { message_type: "private", user_id: 1, message_id: 2 },
        status: "pending",
        attempts: 0,
        availableAt: new Date(0),
      },
    ];
    const fake: any = {
      botMessageInbox: {
        findMany: async ({ where }: any) => rows.filter((row) => row.botAccountId === where.botAccountId && where.status.in.includes(row.status)),
        updateMany: async ({ where, data }: any) => {
          const row = rows.find((item) => item.id === where.id && item.status === where.status);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
        update: async ({ where, data }: any) => {
          const row = rows.find((item) => item.id === where.id);
          Object.assign(row, data);
          return row;
        },
      },
    };
    const consumer = new BotMessageInboxConsumer({ client: fake, maxConcurrency: 1 });
    let calls = 0;
    await consumer.consume("bot", async () => {
      calls += 1;
      throw new Error("暂时失败");
    });
    expect(calls).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);

    rows[0].availableAt = new Date(0);
    rows[0].attempts = 4;
    await consumer.consume("bot", async () => {
      throw new Error("最后一轮退避");
    });
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(5);

    rows[0].availableAt = new Date(0);
    let failed = 0;
    let failedAttempts = 0;
    await consumer.consume("bot", async () => {
      throw new Error("最终失败");
    }, async (record) => {
      failed += 1;
      failedAttempts = record.attempts;
    });
    expect(rows[0].status).toBe("failed");
    expect(rows[0].attempts).toBe(6);
    expect(failed).toBe(1);
    expect(failedAttempts).toBe(6);
    expect(rows[1].status).toBe("pending");
  });

  test("does not let terminal errors block later messages in the same conversation", async () => {
    const rows: any[] = [
      {
        id: "terminal",
        botAccountId: "bot",
        conversationKey: "group:1",
        rawEvent: { message_type: "group", group_id: 1, message_id: 1 },
        status: "pending",
        attempts: 0,
        availableAt: new Date(0),
      },
      {
        id: "later",
        botAccountId: "bot",
        conversationKey: "group:1",
        rawEvent: { message_type: "group", group_id: 1, message_id: 2 },
        status: "pending",
        attempts: 0,
        availableAt: new Date(0),
      },
    ];
    const fake: any = {
      botMessageInbox: {
        findMany: async ({ where }: any) => rows.filter((row) => row.botAccountId === where.botAccountId && where.status.in.includes(row.status)),
        updateMany: async ({ where, data }: any) => {
          const row = rows.find((item) => item.id === where.id && item.status === where.status);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
        update: async ({ where, data }: any) => {
          const row = rows.find((item) => item.id === where.id);
          Object.assign(row, data);
          return row;
        },
      },
    };
    const consumer = new BotMessageInboxConsumer({
      client: fake,
      maxConcurrency: 1,
      shouldRetryError: () => false,
    });
    let calls = 0;
    await consumer.consume("bot", async (_event, record) => {
      calls += 1;
      if (record.id === "terminal") {
        throw new Error("稿件已处理");
      }
    });

    expect(calls).toBe(2);
    expect(rows[0].status).toBe("discarded");
    expect(rows[0].lastError).toBe("稿件已处理");
    expect(rows[1].status).toBe("processed");
  });
});
