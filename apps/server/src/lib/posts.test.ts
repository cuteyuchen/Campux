import { describe, expect, test } from "bun:test";
import { toPostListItem } from "./posts";

type PostInput = Parameters<typeof toPostListItem>[0];
type PostLog = NonNullable<PostInput["logs"]>[number];

function post(logs?: PostLog[]): PostInput {
  return {
    id: "post-1",
    displayId: 1,
    text: "测试稿件",
    attachments: [],
    anonymous: false,
    status: "recalled",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    ...(logs ? { logs } : {}),
  };
}

function log(comment: string, overrides: Partial<PostLog> = {}): PostLog {
  return {
    oldStatus: "published",
    newStatus: "pending_recall",
    comment,
    createdAt: new Date("2026-10-01T01:00:00Z"),
    ...overrides,
  };
}

describe("post recall reasons", () => {
  test("reads and trims a user's recall request", () => {
    expect(toPostListItem(post([log("用户申请撤回：  信息已过期  ")])).recallReason).toBe("信息已过期");
  });

  test("reads the reason from a direct recall completion", () => {
    expect(toPostListItem(post([log("主动撤回：  内容违规  ", { newStatus: "recalled" })])).recallReason).toBe("内容违规");
  });

  test("uses the newest reason regardless of log order", () => {
    const logs = [
      log("主动撤回：审核发现隐私信息", { newStatus: "recalled", createdAt: new Date("2026-10-02T00:00:00Z") }),
      log("用户申请撤回：请删除"),
    ];
    expect(toPostListItem(post(logs)).recallReason).toBe("审核发现隐私信息");
    expect(logs[0]?.comment).toBe("主动撤回：审核发现隐私信息");
  });

  test("preserves the user's reason after execution and default completion logs", () => {
    const logs = [
      log("用户申请撤回：联系方式有误"),
      log("QQ 空间已设置为仅自己可见", { createdAt: new Date("2026-10-01T02:00:00Z") }),
      log("已撤回 1 个发布目标", { oldStatus: "pending_recall", newStatus: "recalled", createdAt: new Date("2026-10-01T03:00:00Z") }),
    ];
    expect(toPostListItem(post(logs)).recallReason).toBe("联系方式有误");
  });

  test("does not infer reasons from unrelated status changes", () => {
    expect(toPostListItem(post([log("主动撤回：非撤回日志", { newStatus: "rejected" })])).recallReason).toBeNull();
  });

  test("keeps legacy posts without recorded reasons compatible", () => {
    expect(toPostListItem(post()).recallReason).toBeNull();
    expect(toPostListItem(post([log("已撤回 1 个发布目标", { newStatus: "recalled" })])).recallReason).toBeNull();
  });
});
