import { describe, expect, test } from "bun:test";

import { buildReviewQueueReminderMessages } from "../runtime/review-queue";
import {
  formatFirstPrivateMessageRegistrationNotice,
  appendPrivateAutoReply,
  formatConfiguredPrivateHelp,
  formatPrivateCommandHelp,
  formatPrivateHelp,
  formatPrivatePostAutoRegistrationNotice,
  formatPrivatePostAppendAck,
  formatPrivatePostBodyStart,
  formatPrivatePostCancelled,
  formatPrivatePostConfirmPrompt,
  formatPrivatePostContinuePrompt,
  formatPrivatePostDraftPrompt,
  formatPrivatePostHistory,
  formatPrivatePostModePrompt,
  formatPrivatePostPublishModePrompt,
  formatPendingPostLimitBlocked,
  formatPrivatePostWithdrawPrompt,
  formatRecallRequestNotification,
  formatRegisterAlready,
  formatRegisterExtended,
  formatRegisterSuccess,
  formatReviewQueue,
  formatReviewQueueMessages,
  formatReviewQueueReminder,
  formatReviewQueueReminderMessages,
  formatSubmissionSuccess,
  type ReviewQueueItem,
} from "./bot-messages";

const loginUrl = "https://wall.campux.top/login";

function expectPostingEntryGuidance(message: string) {
  expect(message).toContain(loginUrl);
  expect(message).toContain("对话投稿");
  expect(message).toContain("也可以登录网站投稿");
  expect(message).toContain("账号是你的 QQ 号");
}

describe("bot registration messages", () => {
  test("new-account notice only includes the initial password and two posting entries", () => {
    const originalRandom = Math.random;
    try {
      for (const stylishEnabled of [false, true]) {
        for (const randomValue of [0, 0.4, 0.8]) {
          Math.random = () => randomValue;
          const message = formatRegisterSuccess("InitPass9", loginUrl, stylishEnabled);

          expect(message).toContain("InitPass9");
          expect(message).toContain("已自动注册");
          expect(message).toContain("账号是你的 QQ 号");
          expect(message).toContain("不是 QQ 密码");
          expect(message).toContain("重置密码");
          expectPostingEntryGuidance(message);
        }
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test("existing account extended to this wall gets the login link without a new password", () => {
    const message = formatRegisterExtended(loginUrl, false);

    expect(message).toContain("沿用原账号");
    expectPostingEntryGuidance(message);
  });

  test("explicit registration command for an existing member still gives the login link", () => {
    expectPostingEntryGuidance(formatRegisterAlready(loginUrl, false));
  });

  test("default help only adds the command-menu entry", () => {
    const originalRandom = Math.random;
    try {
      for (const stylishEnabled of [false, true]) {
        for (const randomValue of [0, 0.5, 0.9]) {
          Math.random = () => randomValue;
          const message = formatPrivateHelp(stylishEnabled);

          expect(message).toContain("发送“投稿”开始对话投稿");
          expect(message).toContain("也可以登录网站投稿");
          expect(message).toContain("xxyg.cuteyuchen.top");
          expect(message).toContain("账号是你的 QQ 号");
          expect(message).toContain("发送“指令”查看全部功能");
          expect(message).not.toContain("稿件：");
          expect(message).not.toContain("撤回：");
          expect(message).not.toContain("自动注册");
          expect(message).not.toContain("#注册账号");
        }
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test("first private message only announces registration when access was created", () => {
    expect(formatFirstPrivateMessageRegistrationNotice({ password: "InitPass9", alreadyHadTenantAccess: false }, loginUrl, false))
      .toContain("InitPass9");
    expect(formatFirstPrivateMessageRegistrationNotice({ password: null, alreadyHadTenantAccess: false }, loginUrl, false))
      .toContain("沿用原账号");
    expect(formatFirstPrivateMessageRegistrationNotice({ password: null, alreadyHadTenantAccess: true }, loginUrl, false))
      .toBeNull();
  });

  test("posting auto-registration notice only appends password", () => {
    const message = formatPrivatePostAutoRegistrationNotice({ password: "InitPass9", alreadyHadTenantAccess: false }, loginUrl);
    expect(message).toContain("账号是你的 QQ 号，初始密码：InitPass9");
    expect(message).not.toContain("登录网站投稿");
    expect(message).not.toContain("检测到当前账号未注册");
    expect(message).not.toContain("当前对话投稿流程已开始");
    expect(formatPrivatePostAutoRegistrationNotice({ password: null, alreadyHadTenantAccess: true }, loginUrl)).toBeNull();
  });

  test("auto-registration notice preserves the configured automatic reply", () => {
    const notice = formatPrivatePostAutoRegistrationNotice({ password: "InitPass9", alreadyHadTenantAccess: false }, loginUrl);
    expect(appendPrivateAutoReply(notice, "自定义自动回复")).toContain("初始密码：InitPass9");
    expect(appendPrivateAutoReply(notice, "自定义自动回复")).toContain("自定义自动回复");
  });

  test("legacy first-private auto-registration copy is replaced by the current help", () => {
    const legacy = "首次私聊会自动注册 Campux 账号。\n发送 #投稿 开始投稿。\n忘记密码时，请发送 #重置密码 获取新密码。";
    const compact = "发送“投稿”开始对话投稿。\n也可以登录网站投稿：https://xxyg.cuteyuchen.top";
    const websiteFirst = "发送“投稿”开始对话投稿。\n网站投稿：https://xxyg.cuteyuchen.top\n发送“指令”查看全部功能。";
    const verbose = "西峡一高表白墙自助投稿助手\n首次发送任意文字会自动注册当前墙，机器人会回复初始密码。\n发送“稿件”或“历史投稿”可查看最近 5 条投稿及状态。\n如有系统使用问题，请联系 QQ 1249882361。";
    expect(formatConfiguredPrivateHelp(legacy, false)).toBe(formatPrivateHelp(false));
    expect(formatConfiguredPrivateHelp(compact, false)).toBe(formatPrivateHelp(false));
    expect(formatConfiguredPrivateHelp(websiteFirst, false)).toBe(formatPrivateHelp(false));
    expect(formatConfiguredPrivateHelp(verbose, false)).toBe(formatPrivateHelp(false));
    expect(formatConfiguredPrivateHelp("自定义回复", false)).toBe("自定义回复");
  });

  test("command help lists global and in-flow commands", () => {
    const message = formatPrivateCommandHelp(false);

    expect(message).toContain("投稿：开始对话投稿");
    expect(message).toContain("稿件：查看最近 5 条投稿");
    expect(message).toContain("撤回：查看可处理稿件");
    expect(message).toContain("撤回 编号 [理由]");
    expect(message).toContain("撤回 12 内容有误");
    expect(message).not.toContain("撤回+编号+理由");
    expect(message).toContain("重置密码：重置登录密码");
    expect(message).toContain("匿名、实名、撤回上一条、结束、确认、取消");
    expect(message).toContain("网页登录账号是你的 QQ 号");
    expect(message).not.toContain("所有指令均不需要 #");
  });
});

describe("bot private post messages", () => {
  test("explains the next action for non-AI intake", () => {
    const message = formatPrivatePostBodyStart(false, false);

    expect(message).toBe("请发送投稿内容，完成后说“结束”。发送“撤回”可撤回上一条。");
    expect(message).toContain("撤回");
    expect(message).not.toContain("取消");
    expect(message).not.toContain("默认文字");
  });

  test("uses semantic edit-state copy for AI intake", () => {
    const message = formatPrivatePostBodyStart(false, true);

    expect(message).toBe("请发送投稿内容，完成后说“结束”。发送“撤回”可撤回上一条。");
  });

  test("uses semantic stylish edit-state copy for AI intake", () => {
    const originalRandom = Math.random;
    try {
      for (const value of [0, 0.3, 0.6, 0.9]) {
        Math.random = () => value;
        const message = formatPrivatePostBodyStart(true, true);

        expect(message).toContain("结束");
        expect(message).toContain("撤回");
        expect(message).not.toContain("取消");
        expect(message).not.toContain("默认文字");
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test("uses semantic draft copy for AI intake", () => {
    const message = formatPrivatePostDraftPrompt(false, true);

    expect(message).toBe("请继续发送投稿内容，完成后说“结束”。发送“撤回”可撤回上一条。");
  });

  test("uses semantic stylish draft copy for AI intake", () => {
    const originalRandom = Math.random;
    try {
      for (const value of [0, 0.45, 0.9]) {
        Math.random = () => value;
        const message = formatPrivatePostDraftPrompt(true, true);

        expect(message).toContain("结束");
        expect(message).toContain("撤回");
        expect(message).not.toContain("取消");
        expect(message).not.toContain("默认文字");
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test("uses semantic confirmation copy for AI intake", () => {
    const message = formatPrivatePostConfirmPrompt("正文", 0, true);

    expect(message).toContain("回复“确认”提交");
    expect(message).toContain("回复“取消”放弃");
    expect(message).toContain("需要修改可继续发送内容");
  });

  test("only shows the required command for each posting stage", () => {
    expect(formatPrivatePostPublishModePrompt(false)).toContain("单发");
    expect(formatPrivatePostModePrompt(false, false)).toBe("请选择“匿名”或“实名”。");
    expect(formatPrivatePostAppendAck(false)).toBe("已添加，完成后说“结束”。发送“撤回”可撤回上一条。");
    expect(formatPrivatePostContinuePrompt(false)).toBe("请继续发送投稿内容，完成后说“结束”。发送“撤回”可撤回上一条。");
    expect(formatPrivatePostCancelled(false)).toBe("已取消本次投稿。");
    expect(formatSubmissionSuccess(123, false)).toBe("投稿成功，稿件编号 #123，请等待审核。");
    expect(formatPendingPostLimitBlocked(1, 1)).toContain("待审核");
  });

  test("formats the latest five post states and withdrawal hint", () => {
    const message = formatPrivatePostHistory([
      { displayId: 12, text: "已经发布的内容", status: "published", createdAt: "2026/7/18 10:00" },
      { displayId: 11, text: "等待审核", status: "pending_approval", createdAt: "2026/7/18 09:00" },
    ]);
    expect(message).toContain("#12｜已发布");
    expect(message).toContain("#11｜待审核");
    expect(message).toContain("撤回 编号");
    expect(message).toContain("撤回 12 内容有误");
    expect(message).not.toContain("撤回123");
  });

  test("formats withdrawal candidates and asks for an id plus reason", () => {
    const message = formatPrivatePostWithdrawPrompt([
      { displayId: 12, text: "已经发布的内容", status: "published", createdAt: "2026/7/18 10:00" },
      { displayId: 11, text: "等待审核", status: "pending_approval", createdAt: "2026/7/18 09:00" },
    ]);
    expect(message).toContain("#12｜已发布");
    expect(message).toContain("#11｜待审核");
    expect(message).toContain("撤回 编号 [理由]");
    expect(message).toContain("撤回 12 内容有误");
    expect(message).not.toContain("撤回+编号+理由");
  });

  test("recall request notification explains quoted approve and reject commands", () => {
    const message = formatRecallRequestNotification(12, "张三", "10001", "内容有误");
    expect(message).toContain("引用本消息");
    expect(message).toContain("过/通过");
    expect(message).toContain("拒/拒绝");
  });
});

describe("review queue messages", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const item = (overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem => ({
    displayId: 123,
    authorName: "张三",
    authorQqUin: "10001",
    anonymous: true,
    text: "今天食堂的番茄炒蛋很好吃，想问问大家还有什么推荐窗口",
    imageCount: 2,
    createdAt: new Date("2026-07-05T09:45:00.000Z"),
    ...overrides,
  });

  test("shows empty review queue", () => {
    expect(formatReviewQueue([], now)).toEqual(["当前没有待审核稿件"]);
  });

  test("formats review queue summary without truncating post content", () => {
    const longText = "第一行很长很长很长很长很长很长很长很长很长很长，第二行也必须完整展示，不能被省略或截断。";
    const lines = formatReviewQueue([item({ text: longText })], now, 3);

    expect(lines[0]).toBe("当前待审核队列：4 条");
    expect(lines[1]).toContain("#123 等待 2小时15分");
    expect(lines[1]).toContain("张三(10001)");
    expect(lines[1]).toContain("匿名");
    expect(lines[1]).toContain("图 2");
    expect(lines[1]).toContain(longText);
    expect(lines[1]).not.toContain("...");
    expect(lines).toContain("还有 3 条未展示，请到后台审核页查看完整队列。");
    expect(lines.at(-1)).toBe("操作：#通过 <稿件id> / #拒绝 <理由> <稿件id>");
  });

  test("splits long review queue messages", () => {
    const messages = formatReviewQueueMessages(
      [item({ displayId: 1 }), item({ displayId: 2 }), item({ displayId: 3 })],
      now,
      0,
      90,
    );

    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0]).toContain("（1/");
    expect(messages.join("\n")).toContain("#1");
    expect(messages.join("\n")).toContain("#3");
  });

  test("formats overdue review queue reminder", () => {
    const lines = formatReviewQueueReminder([item({ displayId: 456, anonymous: false, imageCount: 0 })], 6, now);

    expect(lines[0]).toBe("审核队列提醒：有 1 条稿件已等待超过 6 小时，请尽快处理。");
    expect(lines[1]).toContain("#456");
    expect(lines[1]).toContain("实名");
    expect(lines[1]).toContain("无图");
    expect(lines.at(-1)).toBe("操作：#审核队列 查看全部待审核稿件。");
  });

  test("formats hidden overdue reminder count", () => {
    const lines = formatReviewQueueReminder([item()], 6, now, 5);

    expect(lines[0]).toBe("审核队列提醒：有 6 条稿件已等待超过 6 小时，请尽快处理。");
    expect(lines).toContain("还有 5 条未展示，请到后台审核页查看完整队列。");
  });

  test("splits overdue reminder messages", () => {
    const messages = formatReviewQueueReminderMessages(
      [item({ displayId: 1 }), item({ displayId: 2 }), item({ displayId: 3 })],
      6,
      now,
      2,
      100,
    );

    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0]).toContain("审核队列提醒：有 5 条稿件已等待超过 6 小时");
    expect(messages.join("\n")).toContain("还有 2 条未展示，请到后台审核页查看完整队列。");
  });

  test("mentions all only in the first overdue reminder chunk", () => {
    const messages = buildReviewQueueReminderMessages(
      [item({ displayId: 1 }), item({ displayId: 2 }), item({ displayId: 3 })],
      6,
      now,
      2,
      100,
    );

    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0]).toEqual(expect.arrayContaining([{ type: "at", data: { qq: "all" } }]));
    expect(messages.slice(1).every((message) => typeof message === "string")).toBe(true);
  });
});
