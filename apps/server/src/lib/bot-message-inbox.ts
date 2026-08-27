import { createHash } from "node:crypto";
import { isPrismaKnownRequestError, Prisma } from "@campux/db";
import { prisma } from "./prisma";

export const botMessageInboxRetryDelaysMs = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;
export const botMessageInboxRetentionMs = 7 * 24 * 60 * 60 * 1000;
export const botMessageInboxLockTimeoutMs = 5 * 60 * 1000;

export type BotInboxMessageEvent = {
  post_type?: string;
  message_type?: "private" | "group" | string;
  self_id?: number | string;
  user_id?: number | string;
  group_id?: number | string;
  message_id?: number | string;
  time?: number | string;
  [key: string]: unknown;
};

export type BotMessageInboxClient = typeof prisma;

export function shouldPersistBotMessageEvent(event: BotInboxMessageEvent, reviewGroupId?: string | null) {
  if (event.post_type !== "message") {
    return false;
  }
  if (event.message_type === "private") {
    return Boolean(normalizeId(event.user_id));
  }
  if (event.message_type === "group") {
    const groupId = normalizeId(event.group_id);
    return Boolean(groupId && reviewGroupId && groupId === reviewGroupId);
  }
  return false;
}

export function buildBotMessageConversationKey(event: BotInboxMessageEvent) {
  const messageType = String(event.message_type ?? "unknown");
  const peer = messageType === "group" ? normalizeId(event.group_id) : normalizeId(event.user_id);
  return `${messageType}:${peer ?? "unknown"}`;
}

export function buildBotMessageEventKey(event: BotInboxMessageEvent) {
  const messageType = String(event.message_type ?? "unknown");
  const peer = messageType === "group" ? normalizeId(event.group_id) : normalizeId(event.user_id);
  const messageId = event.message_id === undefined || event.message_id === null ? "" : String(event.message_id);
  if (messageId) {
    return `message:${messageType}:${peer ?? "unknown"}:${messageId}`;
  }
  return `hash:${createHash("sha256").update(stableStringify(event)).digest("hex")}`;
}

export function parseBotMessageEventTime(event: BotInboxMessageEvent, fallback = new Date()) {
  const raw = typeof event.time === "string" ? Number(event.time) : event.time;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return new Date(raw < 10_000_000_000 ? raw * 1_000 : raw);
  }
  return fallback;
}

export async function enqueueBotMessageInbox({
  tenantId,
  botAccountId,
  event,
  receivedAt = new Date(),
}: {
  tenantId: string;
  botAccountId: string;
  event: BotInboxMessageEvent;
  receivedAt?: Date;
}, client: BotMessageInboxClient = prisma) {
  const eventKey = buildBotMessageEventKey(event);
  const conversationKey = buildBotMessageConversationKey(event);
  const eventTime = parseBotMessageEventTime(event, receivedAt);
  try {
    const record = await client.botMessageInbox.create({
      data: {
        tenantId,
        botAccountId,
        eventKey,
        rawEvent: toJsonValue(event),
        messageType: String(event.message_type ?? "unknown"),
        conversationKey,
        eventTime,
        receivedAt,
        availableAt: receivedAt,
      },
    });
    return { created: true as const, record };
  } catch (error) {
    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
      const record = await client.botMessageInbox.findUnique({
        where: { botAccountId_eventKey: { botAccountId, eventKey } },
      });
      return { created: false as const, record };
    }
    throw error;
  }
}

export function retryDelayForAttempt(attempt: number) {
  const index = Math.max(0, Math.min(botMessageInboxRetryDelaysMs.length - 1, Math.trunc(attempt) - 1));
  return botMessageInboxRetryDelaysMs[index] ?? botMessageInboxRetryDelaysMs[0];
}

export type BotMessageInboxConsumerOptions = {
  client?: BotMessageInboxClient;
  maxConcurrency?: number;
  logger?: { warn?(meta: unknown, message?: string): void; info?(meta: unknown, message?: string): void };
};

export class BotMessageInboxConsumer {
  private readonly client: BotMessageInboxClient;
  private readonly maxConcurrency: number;
  private readonly logger?: BotMessageInboxConsumerOptions["logger"];
  private readonly running = new Map<string, Promise<number>>();

  constructor(options: BotMessageInboxConsumerOptions = {}) {
    this.client = options.client ?? prisma;
    this.maxConcurrency = Math.max(1, Math.min(16, Math.trunc(options.maxConcurrency ?? 4)));
    this.logger = options.logger;
  }

  consume(
    botAccountId: string,
    handler: (event: BotInboxMessageEvent, record: any) => Promise<void>,
    onFailed?: (record: any, error: unknown) => Promise<void>,
  ) {
    const existing = this.running.get(botAccountId);
    if (existing) {
      return existing;
    }
    const run = this.run(botAccountId, handler, onFailed).finally(() => {
      this.running.delete(botAccountId);
    });
    this.running.set(botAccountId, run);
    return run;
  }

  async retryFailed(botAccountId: string) {
    const result = await this.client.botMessageInbox.updateMany({
      where: {
        botAccountId,
        status: "failed",
      },
      data: {
        status: "pending",
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lastError: null,
        processedAt: null,
      },
    });
    return result.count;
  }

  async cleanupProcessed(now = new Date()) {
    const result = await this.client.botMessageInbox.deleteMany({
      where: {
        status: "processed",
        processedAt: { lt: new Date(now.getTime() - botMessageInboxRetentionMs) },
      },
    });
    return result.count;
  }

  private async run(
    botAccountId: string,
    handler: (event: BotInboxMessageEvent, record: any) => Promise<void>,
    onFailed?: (record: any, error: unknown) => Promise<void>,
  ) {
    await this.releaseStaleLocks(botAccountId);
    let processed = 0;
    while (true) {
      const now = new Date();
      const records = await this.client.botMessageInbox.findMany({
        where: {
          botAccountId,
          // Keep terminal failures in the ordering scan as a barrier. A later
          // message from the same conversation must not overtake one that is
          // waiting for an operator retry.
          status: { in: ["pending", "processing", "failed"] },
        },
        orderBy: [
          { eventTime: "asc" },
          { receivedAt: "asc" },
          { createdAt: "asc" },
        ],
        take: 100,
      });
      if (records.length === 0) {
        break;
      }

      const firstByConversation = new Map<string, any>();
      for (const record of records) {
        if (!firstByConversation.has(record.conversationKey)) {
          firstByConversation.set(record.conversationKey, record);
        }
      }
      const selected = [...firstByConversation.values()]
        .filter((record) => record.status === "pending" && new Date(record.availableAt).getTime() <= now.getTime())
        .slice(0, this.maxConcurrency);
      if (selected.length === 0) {
        break;
      }
      const results = await Promise.all(selected.map((record) => this.processRecord(record, handler, onFailed)));
      processed += results.filter(Boolean).length;
    }
    return processed;
  }

  private async processRecord(record: any, handler: (event: BotInboxMessageEvent, record: any) => Promise<void>, onFailed?: (record: any, error: unknown) => Promise<void>) {
    const claimed = await this.client.botMessageInbox.updateMany({
      where: {
        id: record.id,
        status: "pending",
        availableAt: { lte: new Date() },
      },
      data: {
        status: "processing",
        lockedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      return false;
    }

    try {
      await handler(record.rawEvent as BotInboxMessageEvent, record);
      await this.client.botMessageInbox.update({
        where: { id: record.id },
        data: {
          status: "processed",
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      return true;
    } catch (error) {
      const attempts = Number(record.attempts ?? 0) + 1;
      // `attempts` includes the initial processing failure. Keep every
      // configured backoff in play, then mark the next failed execution for
      // manual handling.
      const exhausted = attempts > botMessageInboxRetryDelaysMs.length;
      const failedRecord = { ...record, attempts };
      await this.client.botMessageInbox.update({
        where: { id: record.id },
        data: {
          status: exhausted ? "failed" : "pending",
          attempts,
          availableAt: exhausted ? new Date() : new Date(Date.now() + retryDelayForAttempt(attempts)),
          lockedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      if (exhausted) {
        if (onFailed) {
          await onFailed(failedRecord, error).catch((callbackError) => {
            this.logger?.warn?.({ error: callbackError, inboxId: record.id }, "failed to notify bot inbox replay failure");
          });
        }
      }
      this.logger?.warn?.({ error, inboxId: record.id, attempts, exhausted }, "bot message inbox processing failed");
      return true;
    }
  }

  private async releaseStaleLocks(botAccountId: string) {
    await this.client.botMessageInbox.updateMany({
      where: {
        botAccountId,
        status: "processing",
        lockedAt: { lt: new Date(Date.now() - botMessageInboxLockTimeoutMs) },
      },
      data: {
        status: "pending",
        availableAt: new Date(),
        lockedAt: null,
      },
    });
  }
}

function normalizeId(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
