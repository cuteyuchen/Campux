/**
 * Bot 反馈消息多风格语句模块
 *
 * 每种消息类型包含多个风格的变体，每次随机选取一条。
 * 可通过 stylishEnabled 参数控制是否启用多彩风格，
 * 关闭时使用原始的简洁默认消息。
 *
 * 风格倾向：简洁、优美、幽默、温暖、活泼。
 */

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * 转义 QQ/OneBot CQ 码，防止投稿文本中的 [CQ:...] 被解析为消息段。
 * OneBot 使用 XML/JSON 风格的消息段格式，将 [ 替换为全角即可破坏解析。
 */
export function escapeCqCode(text: string): string {
  return text.replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
}

// ── 投稿成功 ──────────────────────────────────────────

const submissionSuccessDefault = (id: number) => `投稿成功！当前稿件编号#${id}`;

const submissionSuccessStylish = [
  (id: number) => `✨ 稿件已收到，为你登记编号 #${id}，等待审核小分队过目~`,
  (id: number) => `📮 信鸽已送达！你的投稿（#${id}）正躺在审核官的桌上，稍安勿躁~`,
  (id: number) => `🎉 欧耶，投稿成功！编号 #${id} 已生成，正在排队等待审核~`,
  (id: number) => `💌 你的心声已收录 🫶 稿件编号 #${id}，审核员们很快就来翻牌~`,
  submissionSuccessDefault,
];

export function formatSubmissionSuccess(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return submissionSuccessDefault(displayId);
  return pick(submissionSuccessStylish)(displayId);
}

// ── 审核通过 ──────────────────────────────────────────

const reviewApprovedDefault = (id: number) => `您的稿件 #${id} 已通过审核`;

const reviewApprovedStylish = [
  (id: number) => `🎉 恭喜！你的稿件 #${id} 成功过审，即将和大家见面~`,
  (id: number) => `🌟 审核官们一致表示：这篇稿子，行！编号 #${id} 准予放行~`,
  (id: number) => `✨ 噔噔噔噔~ 稿件 #${id} 审核通过，准备亮相吧！`,
  (id: number) => `🌸 稿件 #${id} 已通过审核，很快就能跟大家见面啦，期待~`,
  (id: number) => `✅ 审核通过！#${id} —— 审核员们给你点了个赞 👍`,
  reviewApprovedDefault,
];

export function formatReviewApproved(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return reviewApprovedDefault(displayId);
  return pick(reviewApprovedStylish)(displayId);
}

// ── 审核拒绝 ──────────────────────────────────────────

const reviewRejectedDefault = (id: number, reason: string) => `您的稿件 #${id} 未通过审核，原因：${reason}`;

const reviewRejectedStylish = [
  (id: number, reason: string) => `📋 很抱歉，稿件 #${id} 暂未通过审核。原因：${reason}`,
  (id: number, reason: string) => `😅 审核官们挠了挠头，稿件 #${id} 这次没能过关。原因：${reason}`,
  (id: number, reason: string) => `💪 别灰心！稿件 #${id} 这次没能通过，调整一下再来试试~ 原因：${reason}`,
  (id: number, reason: string) => `🚫 稿件 #${id} 审核未通过。原因：${reason}`,
  (id: number, reason: string) => `📝 稿件 #${id} 被退回。审核员的意见是：${reason}\n修改后欢迎再来投稿~`,
  reviewRejectedDefault,
];

export function formatReviewRejected(displayId: number, reason = "审核拒绝", stylishEnabled = false): string {
  if (!stylishEnabled) return reviewRejectedDefault(displayId, reason);
  return pick(reviewRejectedStylish)(displayId, reason);
}

// ── 撤回成功（通知作者） ───────────────────────────────

const recallSuccessDefault = (id: number) => `您的稿件 #${id} 已撤回。`;

const recallSuccessStylish = [
  (id: number) => `🗑️ 稿件 #${id} 已成功撤回~`,
  (id: number) => `↩️ 已撤回！#${id} —— 这条稿子你已经拿回来啦。`,
  (id: number) => `稿件 #${id} 已撤回。世界安静了 😌`,
  (id: number) => `✅ 撤回成功！#${id} 相关内容已设为仅自己可见。`,
  recallSuccessDefault,
];

export function formatRecallSuccess(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return recallSuccessDefault(displayId);
  return pick(recallSuccessStylish)(displayId);
}

// ── 撤回拒绝（通知作者） ───────────────────────────────

const recallRejectedDefault = (id: number, reason: string) => `您的稿件 #${id} 撤回申请未通过。\n理由：${reason}`;

const recallRejectedStylish = [
  (id: number, reason: string) => `😶 撤回申请被拒：#${id}。审核员认为：${reason}`,
  (id: number, reason: string) => `🚫 稿件 #${id} 暂时不能撤回哦。原因：${reason}`,
  (id: number, reason: string) => `🤔 撤回申请未通过：#${id}\n审核员的意见：${reason}`,
  recallRejectedDefault,
];

export function formatRecallRejected(displayId: number, reason: string, stylishEnabled = false): string {
  if (!stylishEnabled) return recallRejectedDefault(displayId, reason);
  return pick(recallRejectedStylish)(displayId, reason);
}

// ── 发布成功（审核群通知） ─────────────────────────────

const publishSuccessDefault = (id: number, externalId: string) => `已成功发表：#${id}\n外部 ID：${externalId}`;

const publishSuccessStylish = [
  (id: number, externalId: string) => `🚀 发射成功！#${id} 已发表（外部 ID：${externalId}）`,
  (id: number, externalId: string) => `🎯 稿件 #${id} 成功发布！外部 ID：${externalId}`,
  (id: number, externalId: string) => `✅ 发表完毕：#${id}\n外部编号：${externalId}`,
  publishSuccessDefault,
];

export function formatPublishSuccess(displayId: number, externalId: string, stylishEnabled = false): string {
  if (!stylishEnabled) return publishSuccessDefault(displayId, externalId);
  return pick(publishSuccessStylish)(displayId, externalId);
}

// ── 发布成功（含目标名称） ─────────────────────────────

const publishSuccessWithTargetDefault = (id: number, target: string, externalId: string) =>
  `已成功发表：#${id}\n目标：${target}\n外部 ID：${externalId}`;

const publishSuccessWithTargetStylish = [
  (id: number, target: string, externalId: string) => `🚀 #${id} 已成功发表至「${target}」\n外部 ID：${externalId}`,
  (id: number, target: string, externalId: string) => `✅ 稿件 #${id} → ${target} 发表成功！\n外部 ID：${externalId}`,
  publishSuccessWithTargetDefault,
];

export function formatPublishSuccessWithTarget(displayId: number, target: string, externalId: string, stylishEnabled = false): string {
  if (!stylishEnabled) return publishSuccessWithTargetDefault(displayId, target, externalId);
  return pick(publishSuccessWithTargetStylish)(displayId, target, externalId);
}

// ── 发布失败 ──────────────────────────────────────────

const publishFailedDefault = (id: number) => `发表失败：#${id}`;
const publishFailedNeedsLoginDefault = (id: number) => `发表失败：#${id}，QZone cookies 未登录或已失效。`;

const publishFailedStylish = [
  (id: number) => `❌ 稿件 #${id} 发表失败了……`,
  (id: number) => `😵 发表翻车了！#${id} 发布未成功。`,
  (id: number) => `🚫 #${id} 发表失败，请检查后重试。`,
  publishFailedDefault,
];

const publishFailedNeedsLoginStylish = [
  (id: number) => `🔑 #${id} 发表失败：QZone 登录态丢了，需要重新登录一下。`,
  (id: number) => `😅 稿件 #${id} 发布失败——QQ空间还没登录呢，先 #登录 吧~`,
  publishFailedNeedsLoginDefault,
];

export function formatPublishFailed(displayId: number, needsLogin: boolean, stylishEnabled = false): string {
  if (!stylishEnabled) {
    return needsLogin ? publishFailedNeedsLoginDefault(displayId) : publishFailedDefault(displayId);
  }
  const pool = needsLogin ? publishFailedNeedsLoginStylish : publishFailedStylish;
  return pick(pool)(displayId);
}

export const publishFailedLoginHint = "请在群内发送 #登录 或 #扫码登录 重新登录后，再重试发布。";

// ── 发布等待 cookies ──────────────────────────────────

const publishWaitingDefault = (id: number) => `发表等待：#${id}`;

const publishWaitingStylish = [
  (id: number) => `⏳ #${id} 正在等待 QZone 登录态恢复……`,
  (id: number) => `💤 稿件 #${id} 已排队，等 cookies 就绪后自动发布。`,
  publishWaitingDefault,
];

export function formatPublishWaiting(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return publishWaitingDefault(displayId);
  return pick(publishWaitingStylish)(displayId);
}

export const publishWaitingResumeHint = "系统不会继续发布这条稿件，直到 QZone cookies 检测可用；重新登录或自动刷新成功后会自动恢复队列。";

// ── 注册成功 ──────────────────────────────────────────

const registerSuccessDefault = (password: string, loginUrl: string) => [
  "注册成功！",
  "登录账号：当前 QQ",
  `初始密码：\n${password}`,
  `登录链接：${loginUrl}`,
  "忘记密码时，请发送“重置密码”获取新密码。",
  "发送“投稿”开始投稿吧~",
].join("\n\n");

const registerSuccessStylish = [
  (password: string, loginUrl: string) => [
    "🎉 注册成功！",
    "登录账号：当前 QQ",
    `初始密码：\n${password}`,
    `登录链接：${loginUrl}`,
    "忘记密码时，请发送“重置密码”获取新密码。",
    "发送“投稿”开始投稿吧~",
  ].join("\n\n"),
  (password: string, loginUrl: string) => [
    "✅ 注册完成！",
    "登录账号：当前 QQ",
    `初始密码：\n${password}`,
    `登录链接：${loginUrl}`,
    "忘记密码时，请发送“重置密码”获取新密码。",
    "发送“投稿”开始投稿吧~",
  ].join("\n\n"),
  registerSuccessDefault,
];

export function formatRegisterSuccess(password: string, loginUrl: string, stylishEnabled = false): string {
  if (!stylishEnabled) return registerSuccessDefault(password, loginUrl);
  return pick(registerSuccessStylish)(password, loginUrl);
}

const registerAlreadyDefault = (loginUrl: string) => [
  "这个 QQ 已经注册过啦。",
  `登录链接：${loginUrl}`,
  "忘记密码时，请发送“重置密码”获取新密码。",
  "发送“投稿”开始投稿吧~",
].join("\n");

const registerAlreadyStylish = [
  (loginUrl: string) => `🤔 这个 QQ 早就注册过了呀~\n登录链接：${loginUrl}\n忘记密码时，请发送“重置密码”获取新密码。\n发送“投稿”开始投稿吧~`,
  (loginUrl: string) => `📌 已经注册过啦。\n登录链接：${loginUrl}\n忘记密码时，请发送“重置密码”获取新密码。\n发送“投稿”开始投稿吧~`,
  registerAlreadyDefault,
];

export function formatRegisterAlready(loginUrl: string, stylishEnabled = false): string {
  if (!stylishEnabled) return registerAlreadyDefault(loginUrl);
  return pick(registerAlreadyStylish)(loginUrl);
}

const registerExtendedDefault = (loginUrl: string) => [
  "已经帮你开通本校园墙的访问权限了，登录密码沿用原账号。",
  `登录链接：${loginUrl}`,
  "忘记密码时，请发送“重置密码”获取新密码。",
  "发送“投稿”开始投稿吧~",
].join("\n");

const registerExtendedStylish = [
  (loginUrl: string) => `🔓 已开通本墙权限，登录密码沿用原账号。\n登录链接：${loginUrl}\n忘记密码时，请发送“重置密码”获取新密码。\n发送“投稿”开始投稿吧~`,
  registerExtendedDefault,
];

export function formatRegisterExtended(loginUrl: string, stylishEnabled = false): string {
  if (!stylishEnabled) return registerExtendedDefault(loginUrl);
  return pick(registerExtendedStylish)(loginUrl);
}

export function formatFirstPrivateMessageRegistrationNotice(
  result: { password: string | null; alreadyHadTenantAccess: boolean },
  loginUrl: string,
  stylishEnabled = false,
): string | null {
  if (result.alreadyHadTenantAccess) return null;
  return result.password
    ? formatRegisterSuccess(result.password, loginUrl, stylishEnabled)
    : formatRegisterExtended(loginUrl, stylishEnabled);
}

export function formatPrivatePostAutoRegistrationNotice(
  result: { password: string | null; alreadyHadTenantAccess: boolean },
  loginUrl: string,
): string | null {
  if (result.alreadyHadTenantAccess) return null;
  if (result.password) {
    return `您未注册当前墙，已自动注册，初始密码为 ${result.password}。您可以登录网站投稿，也可以在当前对话投稿。\n登录链接：${loginUrl}`;
  }
  return `您未注册当前墙，已自动开通当前墙权限，登录密码沿用原账号。您可以登录网站投稿，也可以在当前对话投稿。\n登录链接：${loginUrl}`;
}

const privatePostStatusLabels: Record<string, string> = {
  pending_approval: "待审核",
  approved: "审核通过，等待发布",
  rejected: "审核未通过",
  cancelled: "已取消",
  publishing: "发布中",
  partially_failed: "部分发布失败",
  failed: "发布失败",
  published: "已发布",
  pending_recall: "撤回申请处理中",
  recalled: "已撤回",
};

export function formatPrivatePostStatus(status: string): string {
  return privatePostStatusLabels[status] ?? status;
}

export function formatPrivatePostHistory(items: Array<{ displayId: number; text: string; status: string; createdAt: string }>): string {
  if (items.length === 0) {
    return "您还没有投稿记录。发送“投稿”即可开始投稿。";
  }
  const lines = ["您最近的投稿："];
  for (const item of items) {
    const preview = escapeCqCode(item.text).replace(/\s+/g, " ").trim();
    const shortPreview = preview ? (preview.length > 36 ? `${preview.slice(0, 36)}…` : preview) : "（仅图片投稿）";
    lines.push("", `#${item.displayId}｜${formatPrivatePostStatus(item.status)}｜${item.createdAt}`, shortPreview);
  }
  lines.push("", "发送“撤回123”可取消自己的待审核稿件，或申请撤回自己的已发布稿件；也可以追加撤回理由。前缀 # 可省略。");
  return lines.join("\n");
}

export function formatPrivatePostWithdrawPrompt(items: Array<{ displayId: number; text: string; status: string; createdAt: string }>): string {
  if (items.length === 0) {
    return "当前没有可以取消或申请撤回的稿件。";
  }
  const lines = ["您当前已投稿或已审核通过的稿件："];
  for (const item of items) {
    const preview = escapeCqCode(item.text).replace(/\s+/g, " ").trim();
    const shortPreview = preview ? (preview.length > 36 ? `${preview.slice(0, 36)}…` : preview) : "（仅图片投稿）";
    lines.push("", `#${item.displayId}｜${formatPrivatePostStatus(item.status)}｜${item.createdAt}`, shortPreview);
  }
  lines.push(
    "",
    "请输入“撤回+编号+理由”，例如：撤回12 内容有误。待审核稿件会直接取消，已发布稿件会提交撤回申请；审核通过待发布或发布中的稿件请等待发布完成后再申请。",
  );
  return lines.join("\n");
}

// ── 对话投稿正文编辑引导（选择模式后一次性提示） ──────

const privatePostBodyStartDefault =
  "现在直接发送文字或图片即可；只发图片时会用“投稿”作为默认文字。完成后说“结束”“完成”或“发布”，我会先展示预览；删除上一条说“撤回上一条”，取消本次投稿说“取消”。";
const privatePostBodyStartAiDefault =
  privatePostBodyStartDefault;

const privatePostBodyStartStylish = [
  "📝 开始编辑啦，直接发文字或图片；只发图片会用“投稿”作为默认文字。完成后说“结束”“完成”或“发布”。",
  "✏️ 直接发送正文和图片即可，只发图片也可以。发完说“结束”“完成”或“发布”；放弃说“取消”。",
  "✨ 现在可以连续发送文字和图片，只发图片时默认文字为“投稿”。完成后说“结束”“完成”或“发布”。",
  privatePostBodyStartDefault,
];
const privatePostBodyStartAiStylish = [
  ...privatePostBodyStartStylish,
  privatePostBodyStartAiDefault,
];

export function formatPrivatePostBodyStart(stylishEnabled = false, aiIntakeEnabled = false): string {
  if (aiIntakeEnabled) {
    if (!stylishEnabled) return privatePostBodyStartAiDefault;
    return pick(privatePostBodyStartAiStylish);
  }
  if (!stylishEnabled) return privatePostBodyStartDefault;
  return pick(privatePostBodyStartStylish);
}

// ── 对话投稿追加确认（简短版，不重复完整内容） ────────

const privatePostAppendAckDefault = "已添加。可以继续发送，完成后说“结束”或“发布”。";

const privatePostAppendAckStylish = [
  "✅ 已添加。可以继续发送，完成后说“结束”或“发布”。",
  "📎 收到，已经加进稿件了。发完说“结束”或“发布”即可。",
  "好的，已添加。还可以继续补充，完成后说“结束”。",
  privatePostAppendAckDefault,
];

export function formatPrivatePostAppendAck(stylishEnabled = false): string {
  if (!stylishEnabled) return privatePostAppendAckDefault;
  return pick(privatePostAppendAckStylish);
}

// ── 重置密码 ──────────────────────────────────────────

const resetPasswordDefault = (password: string) => `已经重置好啦，新密码：\n${password}`;

const resetPasswordStylish = [
  (password: string) => `🔑 密码已重置！新密码：\n${password}\n记在小本本上哦~`,
  (password: string) => `✅ 重置成功，新密码请查收：\n${password}\n下次别忘啦 😄`,
  resetPasswordDefault,
];

export function formatResetPassword(password: string, stylishEnabled = false): string {
  if (!stylishEnabled) return resetPasswordDefault(password);
  return pick(resetPasswordStylish)(password);
}

// ── Cookies 刷新成功 ──────────────────────────────────

const cookiesRefreshedDefault = (count: number) => `QZone cookies 已刷新（${count} 项）。`;

const cookiesRefreshedStylish = [
  (count: number) => `🍪 QZone cookies 刷新成功！共 ${count} 项已更新。`,
  (count: number) => `✅ cookies 已刷新（${count} 项），QZone 连接已恢复~`,
  (count: number) => `🔄 刷新完成！${count} 项 cookies 已就绪，可以继续发布了。`,
  cookiesRefreshedDefault,
];

export function formatCookiesRefreshed(count: number, stylishEnabled = false): string {
  if (!stylishEnabled) return cookiesRefreshedDefault(count);
  return pick(cookiesRefreshedStylish)(count);
}

const cookiesAutoRefreshedDefault = () => `QZone cookies 已通过协议自动刷新。`;

const cookiesAutoRefreshedStylish = [
  () => `🤖 协议自动刷新完成，cookies 已更新~`,
  () => `🔄 系统已悄悄帮你刷新了 QZone cookies，后台一切正常~`,
  () => `✅ 自动刷新成功，QZone 的钥匙又到手了 🔑`,
  cookiesAutoRefreshedDefault,
];

export function formatCookiesAutoRefreshed(stylishEnabled = false): string {
  if (!stylishEnabled) return cookiesAutoRefreshedDefault();
  return pick(cookiesAutoRefreshedStylish)();
}

// ── Cookies 失效 ──────────────────────────────────────

const cookiesInvalidDefault = () =>
  `QQ空间cookies已失效，请 @ 并发送 #登录 或 #扫码登录 命令进行重新登录。`;

const cookiesInvalidStylish = [
  () => `🍪 不好了，QZone cookies 过期了……请 @ 我发 #登录 或 #扫码登录 续个命~`,
  () => `🔒 QZone 登录态已失效，发 #登录 或 #扫码登录 重新连一下吧。`,
  cookiesInvalidDefault,
];

const cookiesInvalidWithAutoRefreshFailedDefault = () =>
  `QQ空间cookies已失效，协议自动刷新也失败了，请 @ 并发送 #登录 或 #扫码登录 命令进行重新登录。`;

const cookiesInvalidWithAutoRefreshFailedStylish = [
  () => `😰 QZone cookies 挂了，连自动刷新都没救回来……麻烦 @ 我发 #登录 或 #扫码登录 手动抢救一下。`,
  () => `🚨 cookies 失效且自动刷新失败！请 @ 我发送 #登录 或 #扫码登录 手动处理。`,
  cookiesInvalidWithAutoRefreshFailedDefault,
];

export function formatCookiesInvalid(autoRefreshError?: string | null, stylishEnabled = false): string {
  if (autoRefreshError) return stylishEnabled ? pick(cookiesInvalidWithAutoRefreshFailedStylish)() : cookiesInvalidWithAutoRefreshFailedDefault();
  return stylishEnabled ? pick(cookiesInvalidStylish)() : cookiesInvalidDefault();
}

// ── 审核群操作反馈 ────────────────────────────────────

const reviewApprovedGroupDefault = (id: number) => `已通过 #${id}`;

const reviewApprovedGroupStylish = [
  (id: number) => `✅ 已通过 #${id}`,
  (id: number) => `👍 通过！#${id}`,
  reviewApprovedGroupDefault,
];

const reviewRejectedGroupDefault = (id: number, reason: string) => `已拒绝 #${id}，原因：${reason}`;

const reviewRejectedGroupStylish = [
  (id: number, reason: string) => `❌ 已拒绝 #${id}，原因：${reason}`,
  (id: number, reason: string) => `🚫 #${id} 未通过。原因：${reason}`,
  reviewRejectedGroupDefault,
];

export function formatReviewApprovedGroup(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return reviewApprovedGroupDefault(displayId);
  return pick(reviewApprovedGroupStylish)(displayId);
}

export function formatReviewRejectedGroup(displayId: number, reason: string, stylishEnabled = false): string {
  if (!stylishEnabled) return reviewRejectedGroupDefault(displayId, reason);
  return pick(reviewRejectedGroupStylish)(displayId, reason);
}

// ── 审核群新稿件通知 ──────────────────────────────────

export function formatNewPostReviewNotification(
  tenantName: string,
  displayId: number,
  authorDisplay: string,
  anonymous: boolean,
  qqUin: bigint | string,
  text: string,
  imageCount: number,
  channel: "web" | "private" = "web",
): string[] {
  const attachmentSummary = imageCount > 0 ? `图片：${imageCount} 张` : "图片：0 张";
  const channelLabel = channel === "private" ? "对话投稿" : "网页投稿";
  const authorLine = anonymous
    ? `投稿人：匿名（QQ ${qqUin.toString()}）`
    : `投稿人：${authorDisplay}（QQ ${qqUin.toString()}）`;

  return [
    `📮 ${tenantName} 新稿件`,
    `编号：#${displayId}`,
    authorLine,
    `来源：${channelLabel}`,
    attachmentSummary,
    "",
    escapeCqCode(text),
    "",
    `通过：#通过 ${displayId}`,
    `拒绝：#拒绝 <理由> ${displayId}`,
  ];
}

// ── 撤回请求审核群通知 ────────────────────────────────

export function formatRecallRequestNotification(
  displayId: number,
  authorName: string,
  qqUin: bigint | string,
  reason: string,
  stylishEnabled = false,
): string {
  const prefix = stylishEnabled ? "↩️ " : "";
  return [
    `${prefix}稿件申请撤回：#${displayId}`,
    `申请人：${authorName}（QQ ${qqUin.toString()}）`,
    `理由：${reason}`,
    "引用本消息回复“过/通过”可同意撤回，回复“拒/拒绝”可拒绝；也可以在稿件页面处理。",
    "同意后系统会把每个 QZone 发布目标设置为仅自己可见。",
  ].join("\n");
}

// ── 撤回完成审核群通知 ────────────────────────────────

const postRecalledGroupDefault = (id: number, count: number) =>
  `稿件已撤回：#${id}\n已处理发布目标：${count} 个`;

const postRecalledGroupStylish = [
  (id: number, count: number) => `🗑️ #${id} 已撤回，处理了 ${count} 个发布目标。`,
  (id: number, count: number) => `✅ 撤回完成：#${id}，共 ${count} 个目标已处理。`,
  postRecalledGroupDefault,
];

export function formatPostRecalledGroup(displayId: number, targetCount: number, stylishEnabled = false): string {
  if (!stylishEnabled) return postRecalledGroupDefault(displayId, targetCount);
  return pick(postRecalledGroupStylish)(displayId, targetCount);
}

// ── 撤回申请拒绝（审核群通知） ─────────────────────────

export function formatRecallRejectedNotification(displayId: number, reason: string, stylishEnabled = false): string {
  const prefix = stylishEnabled ? "🚫 " : "";
  return [
    `${prefix}撤回申请已拒绝：#${displayId}`,
    `状态已恢复为已发表。`,
    `理由：${reason}`,
  ].join("\n");
}

// ── 撤回失败（审核群通知） ────────────────────────────

export function formatRecallFailedNotification(
  displayId: number,
  failedResults: Array<{ targetName: string; qzoneTid: string | null; message: string }>,
  stylishEnabled = false,
): string {
  const prefix = stylishEnabled ? "❌ " : "";
  const lines = [
    `${prefix}稿件撤回失败：#${displayId}`,
    ...failedResults.map((r) => `${r.targetName}${r.qzoneTid ? ` / ${r.qzoneTid}` : ""}：${r.message}`),
  ];
  return lines.join("\n");
}

// ── 稿件取消通知 ──────────────────────────────────────

const postCancelledDefault = (id: number) => `稿件已取消：#${id}`;

const postCancelledStylish = [
  (id: number) => `🚫 稿件 #${id} 已取消。`,
  (id: number) => `已取消：#${id}`,
  postCancelledDefault,
];

export function formatPostCancelled(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return postCancelledDefault(displayId);
  return pick(postCancelledStylish)(displayId);
}

// ── 撤回私聊追加 ──────────────────────────────────────

const undoTextDefault = () => `已撤回最近追加的一段文字。`;

const undoTextStylish = [
  () => `↩️ 刚刚追加的文字已撤回~`,
  () => `已撤销上一段文字 ✅`,
  undoTextDefault,
];

const undoImageDefault = (count: number) => `已撤回最近追加的 ${count} 张图片。`;

const undoImageStylish = [
  (count: number) => `↩️ 已撤回刚才加的 ${count} 张图片~`,
  (count: number) => `🖼️ 已撤销 ${count} 张图片。`,
  undoImageDefault,
];

export function formatUndoText(stylishEnabled = false): string {
  if (!stylishEnabled) return undoTextDefault();
  return pick(undoTextStylish)();
}

export function formatUndoImages(count: number, stylishEnabled = false): string {
  if (!stylishEnabled) return undoImageDefault(count);
  return pick(undoImageStylish)(count);
}

// ── 重发入队 ──────────────────────────────────────────

const requeueDefault = (id: number) => `已重新加入发布队列：#${id}`;

const requeueStylish = [
  (id: number) => `🔄 #${id} 已重新入队，马上安排发布~`,
  (id: number) => `✅ 已重新加入队列：#${id}`,
  requeueDefault,
];

export function formatRequeue(displayId: number, stylishEnabled = false): string {
  if (!stylishEnabled) return requeueDefault(displayId);
  return pick(requeueStylish)(displayId);
}

// ── 扫码登录 ──────────────────────────────────────────

const qrLoginSuccessDefault = (count: number) => `扫码登录完成，QZone cookies 已刷新（${count} 项）。`;

const qrLoginSuccessStylish = [
  (count: number) => `✅ 扫码成功！QZone cookies 已刷新（${count} 项），又可以愉快地发稿了~`,
  (count: number) => `🎉 扫码登录完成！${count} 项 cookies 已更新，满血复活~`,
  qrLoginSuccessDefault,
];

export function formatQrLoginSuccess(count: number, stylishEnabled = false): string {
  if (!stylishEnabled) return qrLoginSuccessDefault(count);
  return pick(qrLoginSuccessStylish)(count);
}

const qrLoginTimeoutDefault = () => `扫码登录超时，请重新发送 #扫码登录。`;

const qrLoginTimeoutStylish = [
  () => `⏰ 二维码过期了……重新发一次 #扫码登录 试试~`,
  () => `😴 等了好久没扫上，再发一次 #扫码登录 吧。`,
  qrLoginTimeoutDefault,
];

export function formatQrLoginTimeout(stylishEnabled = false): string {
  if (!stylishEnabled) return qrLoginTimeoutDefault();
  return pick(qrLoginTimeoutStylish)();
}

// ── QZone 自动刷新原因 ────────────────────────────────

export function formatQZoneAutoRefreshReason(reason: string): string {
  if (reason === "publish_login_required") {
    return "发布时检测到登录态失效";
  }
  if (reason === "publish_preflight_invalid") {
    return "发布前发现登录态不可用";
  }
  return "定时检测发现登录态失效";
}

// ── 对话投稿提示 ──────────────────────────────────────

const privatePostModeDefault =
  "这次要匿名还是实名？回复“匿名/不显示名字”或“实名/显示名字”即可；放弃投稿直接说“取消”。";
const privatePostModeAiDefault =
  privatePostModeDefault;

const privatePostModeStylish = [
  "✨ 这次要匿名还是实名？回复“匿名/不显示名字”或“实名/显示名字”都可以，放弃就说“取消”。",
  "📝 请选择匿名方式：回复“匿名”或“实名”；也可以说“不显示名字”或“显示名字”。",
  privatePostModeDefault,
];
const privatePostModeAiStylish = [
  ...privatePostModeStylish,
  privatePostModeAiDefault,
];

export function formatPrivatePostModePrompt(stylishEnabled = false, aiIntakeEnabled = false): string {
  if (aiIntakeEnabled) {
    if (!stylishEnabled) return privatePostModeAiDefault;
    return pick(privatePostModeAiStylish);
  }
  if (!stylishEnabled) return privatePostModeDefault;
  return pick(privatePostModeStylish);
}

// ── 对话投稿草稿提示 ──────────────────────────────────

const privatePostDraftDefault =
  "继续发送文字或图片；只发图片时默认文字为“投稿”。完成后说“结束”“完成”或“发布”，放弃说“取消”。";
const privatePostDraftAiDefault =
  privatePostDraftDefault;

const privatePostDraftStylish = [
  "📎 继续发文字或图片吧。完成后说“结束”“完成”或“发布”；取消就说“取消”。",
  "还可以继续补充文字和图片。发完说“结束”或“发布”，删除上一条说“撤回上一条”。",
  privatePostDraftDefault,
];
const privatePostDraftAiStylish = [
  ...privatePostDraftStylish,
  privatePostDraftAiDefault,
];

export function formatPrivatePostDraftPrompt(stylishEnabled = false, aiIntakeEnabled = false): string {
  if (aiIntakeEnabled) {
    if (!stylishEnabled) return privatePostDraftAiDefault;
    return pick(privatePostDraftAiStylish);
  }
  if (!stylishEnabled) return privatePostDraftDefault;
  return pick(privatePostDraftStylish);
}

// ── 对话投稿继续编辑提示 ──────────────────────────────

const privatePostContinueDefault = "请继续发送文字或图片，完成后说“结束”或“发布”。";

const privatePostContinueStylish = [
  "📝 继续发送文字或图片，发完说“结束”或“发布”即可。",
  "还可以继续补充，完成后说“结束”“完成”或“发布”。",
  privatePostContinueDefault,
];

export function formatPrivatePostContinuePrompt(stylishEnabled = false): string {
  if (!stylishEnabled) return privatePostContinueDefault;
  return pick(privatePostContinueStylish);
}

// ── 对话投稿最终确认 ──────────────────────────────────

function formatPrivatePostPreview(text: string, attachmentCount: number) {
  const trimmed = text.trim();
  const parts = ["请确认投稿内容："];
  if (trimmed) {
    parts.push("", trimmed);
  }
  if (attachmentCount > 0) {
    parts.push("", `图片：${attachmentCount} 张`);
  }
  return parts.join("\n");
}

export function formatPrivatePostConfirmPrompt(text: string, attachmentCount: number, aiIntakeEnabled = false): string {
  void aiIntakeEnabled;
  const actionHint = "回复“确认/可以/发布”提交；还要补充可直接继续发文字或图片，返回编辑说“修改”，放弃说“取消”。";
  return [formatPrivatePostPreview(text, attachmentCount), "", actionHint].join("\n");
}

// ── 对话投稿取消提示 ──────────────────────────────────

const privatePostCancelledDefault = "已取消发布";

const privatePostCancelledStylish = [
  "🗑️ 好的，已取消发布~",
  "已取消 ✅ 这篇稿子不投啦",
  privatePostCancelledDefault,
];

export function formatPrivatePostCancelled(stylishEnabled = false): string {
  if (!stylishEnabled) return privatePostCancelledDefault;
  return pick(privatePostCancelledStylish);
}

// ── 对话投稿帮助 ──────────────────────────────────────

const privateHelpDefault = [
  "首次发送任意文字会自动注册当前墙账号，并告知初始密码。",
  "想投稿时直接说“投稿”“我要投稿”或“帮我投稿”。",
  "选择“匿名/实名”后连续发送文字和图片，完成时说“结束”“完成”或“发布”。",
  "只发图片也可以，系统会使用“投稿”作为默认文字。",
  "预览无误可回复“确认”“可以”或“发布”；还要修改就继续发内容。",
  "发送“历史投稿”或“稿件”可查看最近 5 条投稿；单独发送“撤回”可查看可处理稿件。",
  "发送“撤回123 理由”可取消或申请撤回自己的稿件。",
  "忘记密码说“重置密码”。所有命令都不要求 # 前缀。",
].join("\n");

const privateHelpStylish = [
  [
    "📋 我可以帮你做这些事：",
    "",
    "投稿 — 开始对话投稿，未注册时自动注册",
    "重置密码 — 获取新密码",
    "历史投稿 / 稿件 — 查看最近 5 条投稿",
    "撤回 — 查看可取消或申请撤回的稿件",
    "撤回123 理由 — 取消或申请撤回自己的稿件",
    "取消 — 取消本次对话投稿（# 前缀可省略）",
  ].join("\n"),
  [
    "✨ 试试这些功能吧：",
    "",
    "• 发送“投稿”开始投稿，未注册时自动注册",
    "• 发送“重置密码”获取新密码",
    "• 发送“历史投稿”或“稿件”查看最近 5 条",
    "• 单独发送“撤回”查看可处理稿件",
    "• 发送“撤回123 理由”取消或申请撤回自己的稿件",
    "• 所有命令的 # 前缀均可省略",
  ].join("\n"),
  privateHelpDefault,
];

export function formatPrivateHelp(stylishEnabled = false): string {
  if (!stylishEnabled) return privateHelpDefault;
  return pick(privateHelpStylish);
}

const legacyPrivateAutoRegistrationReply = "首次私聊会自动注册 Campux 账号。\n发送 #投稿 开始投稿。\n忘记密码时，请发送 #重置密码 获取新密码。";

export function formatConfiguredPrivateHelp(configured: string | null | undefined, stylishEnabled = false): string {
  if (!configured?.trim() || configured.trim() === legacyPrivateAutoRegistrationReply) {
    return formatPrivateHelp(stylishEnabled);
  }
  return configured;
}

// ── 私信回复 ──────────────────────────────────────────

const privateReplySentDefault = (nickname: string, qqUin: string) =>
  `已回复 ${nickname}（${qqUin}）`;

const privateReplySentStylish = [
  (nickname: string, qqUin: string) => `✅ 已回复 ${nickname}（${qqUin}）`,
  (nickname: string, qqUin: string) => `💬 回复已送达 ${nickname}（${qqUin}）`,
  privateReplySentDefault,
];

export function formatPrivateReplySent(nickname: string, qqUin: string, stylishEnabled = false): string {
  if (!stylishEnabled) return privateReplySentDefault(nickname, qqUin);
  return pick(privateReplySentStylish)(nickname, qqUin);
}

const privateReplyReceivedDefault = (text: string) =>
  `📩 管理员回复：\n${text}`;

const privateReplyReceivedStylish = [
  (text: string) => `📬 管理员给你回信啦：\n${text}`,
  (text: string) => `💬 来自管理员的回复：\n${text}`,
  privateReplyReceivedDefault,
];

export function formatPrivateReplyReceived(text: string, stylishEnabled = false): string {
  if (!stylishEnabled) return privateReplyReceivedDefault(text);
  return pick(privateReplyReceivedStylish)(text);
}

const privateReplyNoTargetDefault = () => `请引用转发的私信消息后发送 #回复 <内容> 来回复用户。`;

const privateReplyNoTargetStylish = [
  () => `🤔 请先引用转发的私信消息，再发 #回复 <内容> 来回复对方~`,
  () => `💡 引用一条转发的私信消息，发送 #回复 <内容> 即可回复用户。`,
  privateReplyNoTargetDefault,
];

export function formatPrivateReplyNoTarget(stylishEnabled = false): string {
  if (!stylishEnabled) return privateReplyNoTargetDefault();
  return pick(privateReplyNoTargetStylish)();
}

// ── 好友数量查询 ──────────────────────────────────────

const friendCountDefault = (displayName: string, count: number) =>
  `📊 ${displayName} 当前好友数量：${count}`;

const friendCountStylish = [
  (displayName: string, count: number) => `👥 ${displayName} 的好友列表：共 ${count} 位好友`,
  (displayName: string, count: number) => `🤝 ${displayName} 当前有 ${count} 位好友~`,
  friendCountDefault,
];

export function formatFriendCount(displayName: string, count: number, stylishEnabled = false): string {
  if (!stylishEnabled) return friendCountDefault(displayName, count);
  return pick(friendCountStylish)(displayName, count);
}

// ── 直接发布成功（审核群 #发布 命令） ──────────────────

const botPublishSuccessDefault = (qzoneTid?: string) =>
  qzoneTid ? `✅ 已发布到 QQ 空间！(tid:${qzoneTid})` : `✅ 已发布到 QQ 空间！`;

const botPublishSuccessStylish = [
  (qzoneTid?: string) => qzoneTid ? `📢 发布成功！内容已推送至 QQ 空间~ (tid:${qzoneTid})` : `📢 发布成功！内容已推送至 QQ 空间~`,
  (qzoneTid?: string) => qzoneTid ? `✍️ 内容已经发出去啦，回复 #撤回 可以撤回这条说说~ (tid:${qzoneTid})` : `✍️ 内容已经发出去啦，等着大家围观吧~`,
  (qzoneTid?: string) => qzoneTid ? `📯 号外号外！已发布到 QQ 空间~ (tid:${qzoneTid})` : `📯 号外号外！已发布到 QQ 空间~`,
  botPublishSuccessDefault,
];

export function formatBotPublishSuccess(stylishEnabled = false, qzoneTid?: string): string {
  if (!stylishEnabled) return botPublishSuccessDefault(qzoneTid);
  return pick(botPublishSuccessStylish)(qzoneTid);
}

// ── 直接发布撤回成功（审核群 #撤回 命令） ─────────────

const botRecallSuccessDefault = () =>
  `✅ 已撤回，QQ 空间说说已设为仅自己可见。`;

const botRecallSuccessStylish = [
  () => `🗑️ 已撤回！说说已从空间隐藏~`,
  () => `↩️ 撤回成功，相关内容已设为仅自己可见。`,
  () => `✅ 搞定！那条说说已经安静地藏起来啦~`,
  botRecallSuccessDefault,
];

export function formatBotRecallSuccess(stylishEnabled = false): string {
  if (!stylishEnabled) return botRecallSuccessDefault();
  return pick(botRecallSuccessStylish)();
}

// ── 直接发布撤回失败 ─────────────────────────────────

const botRecallFailedDefault = (reason: string) =>
  `❌ 撤回失败：${reason}`;

const botRecallFailedStylish = [
  (reason: string) => `😵 撤回翻车了…… ${reason}`,
  (reason: string) => `🚫 撤回失败：${reason}`,
  botRecallFailedDefault,
];

export function formatBotRecallFailed(reason: string, stylishEnabled = false): string {
  if (!stylishEnabled) return botRecallFailedDefault(reason);
  return pick(botRecallFailedStylish)(reason);
}

// ── 直接发布帮助提示（审核群 #发布 命令） ───────────────

const botPublishHelpDefault = () =>
  `发送 #发布 <内容> 来直接发布文字到 QQ 空间，图文一起发送时图片也会一起发布。`;

const botPublishHelpStylish = [
  () => `📝 想发点东西？试试 #发布 今天天气真不错~ 带上图片也能一起发~`,
  () => `💡 用 #发布 <内容> 可以直接发布文字和图片到 QQ 空间哦~`,
  botPublishHelpDefault,
];

export function formatBotPublishHelp(stylishEnabled = false): string {
  if (!stylishEnabled) return botPublishHelpDefault();
  return pick(botPublishHelpStylish)();
}

// ── 解封 ──────────────────────────────────────────

const unbanSuccessDefault = (qqUin: string) => `已解封 QQ ${qqUin}`;

const unbanSuccessStylish = [
  (qqUin: string) => `🔓 已为 QQ ${qqUin} 解除封禁，欢迎回来~`,
  (qqUin: string) => `✅ 解封成功！QQ ${qqUin} 现在可以正常使用啦~`,
  (qqUin: string) => `🎉 QQ ${qqUin} 已解封，自由啦~`,
  unbanSuccessDefault,
];

const unbanNotFoundDefault = (qqUin: string) => `未找到 QQ ${qqUin} 的封禁记录`;

const unbanNotFoundStylish = [
  (qqUin: string) => `🔍 没有找到 QQ ${qqUin} 的封禁记录，可能是没有被封禁哦~`,
  (qqUin: string) => `🤔 QQ ${qqUin} 似乎没有被封禁，无需解封~`,
  unbanNotFoundDefault,
];

export function formatUnbanSuccess(qqUin: string, stylishEnabled = false): string {
  if (!stylishEnabled) return unbanSuccessDefault(qqUin);
  return pick(unbanSuccessStylish)(qqUin);
}

export function formatUnbanNotFound(qqUin: string, stylishEnabled = false): string {
  if (!stylishEnabled) return unbanNotFoundDefault(qqUin);
  return pick(unbanNotFoundStylish)(qqUin);
}

// ── 封禁/解封通知（发给用户的私信）────────────────────

export function formatBanNotify(tenantName: string, reason: string, endsAt: Date): string {
  const remaining = Math.ceil((endsAt.getTime() - Date.now()) / (60 * 60 * 1000));
  if (remaining > 1) {
    return `你的账号在「${tenantName}」中被封禁，原因：${reason}，预计 ${remaining} 小时后解封。`;
  }
  return `你的账号在「${tenantName}」中被封禁，原因：${reason}，预计 1 小时内解封。`;
}

export function formatUnbanNotify(tenantName: string): string {
  return `你的账号在「${tenantName}」中已被解封，现在可以正常使用。`;
}

// ── 审核队列 ──────────────────────────────────────────

export type ReviewQueueItem = {
  displayId: number;
  authorName: string;
  authorQqUin: string;
  anonymous: boolean;
  text: string;
  imageCount: number;
  createdAt: Date;
};

export const reviewQueueDefaultDisplayLimit = 100;
export const reviewQueueMessageMaxChars = 2500;

function formatReviewQueueDuration(createdAt: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60_000));
  if (minutes < 60) {
    return `${Math.max(1, minutes)}分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分` : `${hours}小时`;
}

function formatReviewQueueContent(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "（无文字）";
  }
  return normalized;
}

function formatReviewQueueLine(item: ReviewQueueItem, index: number, now: Date) {
  const authorName = item.authorName || "未命名";
  const imageLabel = item.imageCount > 0 ? `图 ${item.imageCount}` : "无图";
  const anonymousLabel = item.anonymous ? "匿名" : "实名";
  return `${index + 1}. #${item.displayId} 等待 ${formatReviewQueueDuration(item.createdAt, now)}｜${authorName}(${item.authorQqUin})｜${anonymousLabel}｜${imageLabel}｜${formatReviewQueueContent(item.text)}`;
}

export function formatReviewQueue(items: ReviewQueueItem[], now = new Date(), hiddenCount = 0): string[] {
  if (items.length === 0 && hiddenCount <= 0) {
    return ["当前没有待审核稿件"];
  }
  const total = items.length + Math.max(0, hiddenCount);
  const lines = [`当前待审核队列：${total} 条`];
  lines.push(...items.map((item, index) => formatReviewQueueLine(item, index, now)));
  if (hiddenCount > 0) {
    lines.push(`还有 ${hiddenCount} 条未展示，请到后台审核页查看完整队列。`);
  }
  lines.push("", "操作：#通过 <稿件id> / #拒绝 <理由> <稿件id>");
  return lines;
}

export function formatReviewQueueMessages(items: ReviewQueueItem[], now = new Date(), hiddenCount = 0, maxChars = reviewQueueMessageMaxChars): string[] {
  return chunkReviewQueueLines(formatReviewQueue(items, now, hiddenCount), maxChars);
}

export function formatReviewQueueReminder(items: ReviewQueueItem[], thresholdHours: number, now = new Date(), hiddenCount = 0): string[] {
  if (items.length === 0 && hiddenCount <= 0) {
    return ["审核队列提醒：当前没有超时待审核稿件。"];
  }
  const total = items.length + Math.max(0, hiddenCount);
  const lines = [
    `审核队列提醒：有 ${total} 条稿件已等待超过 ${thresholdHours} 小时，请尽快处理。`,
    ...items.map((item, index) => formatReviewQueueLine(item, index, now)),
  ];
  if (hiddenCount > 0) {
    lines.push(`还有 ${hiddenCount} 条未展示，请到后台审核页查看完整队列。`);
  }
  lines.push("", "操作：#审核队列 查看全部待审核稿件。");
  return lines;
}

export function formatReviewQueueReminderMessages(items: ReviewQueueItem[], thresholdHours: number, now = new Date(), hiddenCount = 0, maxChars = reviewQueueMessageMaxChars): string[] {
  return chunkReviewQueueLines(formatReviewQueueReminder(items, thresholdHours, now, hiddenCount), maxChars);
}

function chunkReviewQueueLines(lines: string[], maxChars: number): string[] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const line of lines) {
    const nextLength = currentLength + line.length + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && nextLength > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  if (chunks.length <= 1) {
    return [lines.join("\n")];
  }
  return chunks.map((chunk, index) => [`（${index + 1}/${chunks.length}）`, ...chunk].join("\n"));
}
