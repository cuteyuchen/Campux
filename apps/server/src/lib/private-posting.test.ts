import { describe, expect, test } from "bun:test";
import { extractOneBotImageSegments, extractOneBotPlainText, isPrivatePostCancelText, isPrivatePostFinishText, isPrivatePostUndoText, parsePrivatePostConfirmText, parsePrivatePostManagementCommand, parsePrivatePostModeText, parsePrivatePostStartText } from "./private-posting";

describe("private posting command parsing", () => {
  test("parses English hash start command", () => {
    expect(parsePrivatePostStartText("#投稿 你好，世界")).toBe("你好，世界");
  });

  test("parses Chinese hash start command", () => {
    expect(parsePrivatePostStartText("＃投稿 你好，世界")).toBe("你好，世界");
  });

  test("accepts start command without a body", () => {
    expect(parsePrivatePostStartText("#投稿")).toBe("");
    expect(parsePrivatePostStartText("投稿")).toBe("");
    expect(parsePrivatePostStartText("投稿 正文")).toBe("正文");
  });

  test("detects finish command with either hash", () => {
    expect(isPrivatePostFinishText("#结束")).toBe(true);
    expect(isPrivatePostFinishText("＃结束")).toBe(true);
    expect(isPrivatePostFinishText("#结束投稿")).toBe(true);
    expect(isPrivatePostFinishText("＃结束投稿")).toBe(true);
    expect(isPrivatePostFinishText("#结束投稿  ")).toBe(true);
    expect(isPrivatePostFinishText("结束")).toBe(true);
  });

  test("detects cancel command with either hash", () => {
    expect(isPrivatePostCancelText("#取消")).toBe(true);
    expect(isPrivatePostCancelText("＃取消")).toBe(true);
    expect(isPrivatePostCancelText("#取消本次投稿")).toBe(true);
    expect(isPrivatePostCancelText("＃取消本次投稿")).toBe(true);
    expect(isPrivatePostCancelText("取消")).toBe(true);
  });

  test("detects undo command with either hash", () => {
    expect(isPrivatePostUndoText("#撤回")).toBe(true);
    expect(isPrivatePostUndoText("＃撤回上一条")).toBe(true);
    expect(isPrivatePostUndoText("#撤回上一步  ")).toBe(true);
    expect(isPrivatePostUndoText("撤回")).toBe(true);
  });

  test("detects anonymous and real-name replies", () => {
    expect(parsePrivatePostModeText("#匿名")).toEqual({ anonymous: true });
    expect(parsePrivatePostModeText("＃匿名投稿")).toEqual({ anonymous: true });
    expect(parsePrivatePostModeText("#实名")).toEqual({ anonymous: false });
    expect(parsePrivatePostModeText("＃实名投稿")).toEqual({ anonymous: false });
    expect(parsePrivatePostModeText("匿名")).toEqual({ anonymous: true });
    expect(parsePrivatePostModeText("实名")).toEqual({ anonymous: false });
  });

  test("does not treat ordinary text as undo command", () => {
    expect(isPrivatePostUndoText("#撤回一下")).toBe(false);
    expect(isPrivatePostUndoText("撤回123")).toBe(false);
  });

  test("accepts extra trigger keywords", () => {
    const extra = ["发帖", "吐槽", "表白"];
    expect(parsePrivatePostStartText("#发帖 你好", extra)).toBe("你好");
    expect(parsePrivatePostStartText("＃发帖 你好", extra)).toBe("你好");
    expect(parsePrivatePostStartText("#吐槽 今天好烦", extra)).toBe("今天好烦");
    expect(parsePrivatePostStartText("#表白 隔壁班的同学", extra)).toBe("隔壁班的同学");
    expect(parsePrivatePostStartText("#发帖", extra)).toBe("");
    expect(parsePrivatePostStartText("发帖 你好", extra)).toBe("你好");
  });

  test("extra keywords never override default #投稿", () => {
    expect(parsePrivatePostStartText("#投稿 正文", [])).toBe("正文");
    expect(parsePrivatePostStartText("＃投稿 正文", undefined)).toBe("正文");
    expect(parsePrivatePostStartText("#投稿", ["发帖"])).toBe("");
  });

  test("keeps explicit start commands enabled when AI intake is enabled", () => {
    const options = { extraKeywords: ["发帖"], aiIntakeEnabled: true };
    expect(parsePrivatePostStartText("#投稿 正文", options)).toBe("正文");
    expect(parsePrivatePostStartText("＃投稿 正文", options)).toBe("正文");
    expect(parsePrivatePostStartText("#发帖 正文", options)).toBe("正文");
    expect(parsePrivatePostStartText("投稿", options)).toBe("");
    expect(parsePrivatePostStartText("墙墙投稿", options)).toBe("");
  });

  test("keeps start commands enabled when AI intake is disabled", () => {
    const options = { extraKeywords: ["发帖"], aiIntakeEnabled: false };
    expect(parsePrivatePostStartText("#投稿 正文", options)).toBe("正文");
    expect(parsePrivatePostStartText("#发帖 正文", options)).toBe("正文");
    expect(parsePrivatePostStartText("投稿", options)).toBe("");
  });

  test("does not match unrelated text as an extra keyword", () => {
    expect(parsePrivatePostStartText("发帖", ["发帖"])).toBe("");
    expect(parsePrivatePostStartText("随便说点什么", ["发帖", "吐槽"])).toBeNull();
    expect(parsePrivatePostStartText("#其他命令", ["发帖"])).toBeNull();
  });

  test("accepts confirmation without a command prefix", () => {
    expect(parsePrivatePostConfirmText("确认")).toEqual({ confirmed: true });
    expect(parsePrivatePostConfirmText("取消")).toEqual({ confirmed: false });
  });

  test("parses history and withdrawal management commands without requiring a prefix", () => {
    expect(parsePrivatePostManagementCommand("历史投稿")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("#历史投稿")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("稿件")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("#稿件")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("撤回")).toEqual({ name: "withdraw_list" });
    expect(parsePrivatePostManagementCommand("#撤回")).toEqual({ name: "withdraw_list" });
    expect(parsePrivatePostManagementCommand("撤回123")).toEqual({ name: "withdraw", displayId: 123, reason: null });
    expect(parsePrivatePostManagementCommand("撤回 #123 不想公开了")).toEqual({ name: "withdraw", displayId: 123, reason: "不想公开了" });
    expect(parsePrivatePostManagementCommand("#撤回 456 内容有误")).toEqual({ name: "withdraw", displayId: 456, reason: "内容有误" });
  });
});

describe("onebot message helpers", () => {
  test("extracts plain text from onebot segments", () => {
    expect(
      extractOneBotPlainText([
        { type: "text", data: { text: "#投稿 " } },
        { type: "image", data: { file: "base64://abc" } },
        { type: "text", data: { text: "正文" } },
      ]),
    ).toBe("#投稿 \n正文");
  });

  test("extracts image segments only", () => {
    expect(
      extractOneBotImageSegments([
        { type: "text", data: { text: "hello" } },
        { type: "image", data: { file: "base64://abc" } },
        { type: "image", data: { url: "https://example.com/a.png" } },
      ]),
    ).toHaveLength(2);
  });
});
