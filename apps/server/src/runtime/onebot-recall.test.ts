import { afterEach, describe, expect, mock, test } from "bun:test";
import { prisma } from "../lib/prisma";
import { OneBotRuntime } from "./onebot";

const originalPrisma = prisma;

afterEach(() => {
  mock.module("../lib/prisma", () => ({ prisma: originalPrisma }));
});

function createFixture() {
  const post = {
    id: "post-1",
    displayId: 12,
    tenantId: "tenant-1",
    author: { qqUin: 12345n },
  };
  mock.module("../lib/prisma", () => ({
    prisma: {
      post: { findUnique: async () => post },
      tenantMetadata: { findUnique: async () => null },
      botAccount: { findMany: async () => [{ qqUin: 67890n }] },
    },
  }));

  const runtime = new OneBotRuntime({} as never, { warn: () => undefined } as never);
  const groupMessage = mock(async (_tenantId: string, _message: string) => undefined);
  const privateMessage = mock(async (_botQq: string, _userQq: bigint, _message: string) => undefined);
  const notifications = runtime as unknown as {
    sendTenantReviewNotification: typeof groupMessage;
    sendPrivateMessage: typeof privateMessage;
  };
  notifications.sendTenantReviewNotification = groupMessage;
  notifications.sendPrivateMessage = privateMessage;
  return { runtime, groupMessage, privateMessage };
}

describe("OneBot recall notifications", () => {
  test("includes the direct recall reason in the review group notification and notifies the author", async () => {
    const fixture = createFixture();
    await fixture.runtime.notifyPostRecalled("post-1", 1, { reason: "内容有误" });
    expect(fixture.groupMessage).toHaveBeenCalledWith("tenant-1", expect.stringContaining("撤回理由：内容有误"));
    expect(fixture.privateMessage).toHaveBeenCalledWith("67890", 12345n, expect.stringContaining("12"));
  });

  test("silent recalls still record the reason in the review group and skip the author", async () => {
    const fixture = createFixture();
    await fixture.runtime.notifyPostRecalled("post-1", 1, { skipAuthor: true, reason: "包含隐私信息" });
    expect(fixture.groupMessage).toHaveBeenCalledWith("tenant-1", expect.stringContaining("撤回理由：包含隐私信息"));
    expect(fixture.groupMessage).toHaveBeenCalledWith("tenant-1", expect.stringContaining("静默撤回，未通知作者"));
    expect(fixture.privateMessage).not.toHaveBeenCalled();
  });

  test("existing notifications without a reason retain their behavior", async () => {
    const fixture = createFixture();
    await fixture.runtime.notifyPostRecalled("post-1", 0, { manuallyRecalled: true });
    expect(fixture.groupMessage).toHaveBeenCalledWith("tenant-1", expect.stringContaining("管理员已手动撤回批量发布内容"));
    expect(fixture.groupMessage.mock.calls[0]?.[1]).not.toContain("撤回理由：");
    expect(fixture.privateMessage).toHaveBeenCalledTimes(1);
  });
});
