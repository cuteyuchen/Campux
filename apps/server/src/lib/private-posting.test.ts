import { describe, expect, test } from "bun:test";
import { countOneBotPostableImages, extractOneBotImageSegments, extractOneBotPlainText, isPrivatePostCancelText, isPrivatePostEditText, isPrivatePostFinishText, isPrivatePostUndoText, parsePrivatePostConfirmText, parsePrivatePostManagementCommand, parsePrivatePostModeText, parsePrivatePostPublishModeText, parsePrivatePostStartModeText, parsePrivatePostStartText, resolvePrivatePostSubmissionText, shouldAutoRegisterPrivateMessage } from "./private-posting";

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
    expect(isPrivatePostFinishText("结束了。")).toBe(true);
    expect(isPrivatePostFinishText("发布")).toBe(true);
    expect(isPrivatePostFinishText("结束\u200b")).toBe(true);
    expect(isPrivatePostFinishText("好")).toBe(false);
    expect(isPrivatePostFinishText("好了")).toBe(false);
  });

  test("detects cancel command with either hash", () => {
    expect(isPrivatePostCancelText("#取消")).toBe(true);
    expect(isPrivatePostCancelText("＃取消")).toBe(true);
    expect(isPrivatePostCancelText("#取消本次投稿")).toBe(true);
    expect(isPrivatePostCancelText("＃取消本次投稿")).toBe(true);
    expect(isPrivatePostCancelText("取消")).toBe(true);
    expect(isPrivatePostCancelText("不投了！")).toBe(true);
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
    expect(parsePrivatePostModeText("不显示名字")).toEqual({ anonymous: true });
    expect(parsePrivatePostModeText("显示昵称")).toEqual({ anonymous: false });
    expect(parsePrivatePostPublishModeText("单发")).toEqual({ publishImmediately: true });
    expect(parsePrivatePostPublishModeText("立即发布")).toEqual({ publishImmediately: true });
    expect(parsePrivatePostPublishModeText("批量")).toEqual({ publishImmediately: false });
    expect(parsePrivatePostPublishModeText("合并发布")).toEqual({ publishImmediately: false });
    expect(parsePrivatePostPublishModeText("匿名")).toBeNull();
  });

  test("accepts natural start phrases", () => {
    expect(parsePrivatePostStartText("我要投稿")).toBe("");
    expect(parsePrivatePostStartText("帮我投稿：今天食堂加餐")).toBe("今天食堂加餐");
    expect(parsePrivatePostStartText("墙墙帮我发 今天食堂加餐")).toBe("今天食堂加餐");
    expect(parsePrivatePostStartText("匿名投稿：今天食堂加餐")).toBe("今天食堂加餐");
    expect(parsePrivatePostStartModeText("匿名投稿：今天食堂加餐")).toEqual({ anonymous: true });
    expect(parsePrivatePostStartModeText("实名投稿：今天食堂加餐")).toEqual({ anonymous: false });
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
    expect(parsePrivatePostStartText("投稿\u200b")).toBe("");
    expect(parsePrivatePostStartText("#投稿\u200b")).toBe("");
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
    expect(parsePrivatePostConfirmText("没问题！")).toEqual({ confirmed: true });
    expect(parsePrivatePostConfirmText("结束")).toEqual({ confirmed: true });
  });

  test("accepts edit requests and defaults image-only text", () => {
    expect(isPrivatePostEditText("再改一下")).toBe(true);
    expect(resolvePrivatePostSubmissionText("", 2)).toBe("投稿");
    expect(resolvePrivatePostSubmissionText("\u200b", 2)).toBe("投稿");
    expect(resolvePrivatePostSubmissionText("\u200b", 0)).toBe("");
    expect(resolvePrivatePostSubmissionText("  ", 0)).toBe("");
    expect(resolvePrivatePostSubmissionText("正文", 2)).toBe("正文");
    expect(shouldAutoRegisterPrivateMessage("你好")).toBe(true);
    expect(shouldAutoRegisterPrivateMessage("  ")).toBe(false);
    expect(shouldAutoRegisterPrivateMessage("", 1)).toBe(true);
    expect(shouldAutoRegisterPrivateMessage("  ", 0)).toBe(false);
  });

  test("parses history and withdrawal management commands without requiring a prefix", () => {
    expect(parsePrivatePostManagementCommand("历史投稿")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("#历史投稿")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("稿件")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("#稿件")).toEqual({ name: "history" });
    expect(parsePrivatePostManagementCommand("撤回")).toEqual({ name: "withdraw_list" });
    expect(parsePrivatePostManagementCommand("#撤回")).toEqual({ name: "withdraw_list" });
    expect(parsePrivatePostManagementCommand("撤回123")).toEqual({ name: "withdraw", displayId: 123, reason: null });
    expect(parsePrivatePostManagementCommand("撤回 12")).toEqual({ name: "withdraw", displayId: 12, reason: null });
    expect(parsePrivatePostManagementCommand("撤回12有误")).toEqual({ name: "withdraw", displayId: 12, reason: "有误" });
    expect(parsePrivatePostManagementCommand("撤回 12 有误")).toEqual({ name: "withdraw", displayId: 12, reason: "有误" });
    expect(parsePrivatePostManagementCommand("撤回 #12有误")).toEqual({ name: "withdraw", displayId: 12, reason: "有误" });
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
    expect(extractOneBotPlainText("结束\u200b")).toBe("结束\u200b");
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

  test("counts postable images and ignores sticker-only images", () => {
    expect(countOneBotPostableImages([
      { type: "text", data: { text: "hello" } },
      { type: "image", data: { file: "photo.jpg" } },
      { type: "image", data: { file: "sticker.gif", sub_type: 1 } },
    ])).toBe(1);
    expect(countOneBotPostableImages([
      { type: "image", data: { file: "sticker.gif", sub_type: "1" } },
    ])).toBe(0);
  });
});
