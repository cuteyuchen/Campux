export type OneBotMessageSegment = {
  type?: string;
  data?: Record<string, unknown>;
};

import { stripZeroWidthChars } from "./sanitize";

/**
 * 检查 input 是否以指定的关键词开头（支持半角 # 和全角 ＃ 前缀）。
 * 关键词本身不应包含 # 前缀。
 */
function matchKeyword(input: string, keyword: string): string | null {
  const half = `#${keyword}`;
  const full = `＃${keyword}`;
  const prefix = input.startsWith(half) ? half : input.startsWith(full) ? full : null;
  if (prefix) return input.slice(prefix.length).trimStart();
  if (input === keyword) return "";
  if (!input.startsWith(keyword)) return null;
  const suffix = input.slice(keyword.length);
  if (!/^[\s:：]/.test(suffix)) return null;
  return suffix.replace(/^[\s:：]+/, "");
}

function stripCommandPrefix(input: string) {
  return stripZeroWidthChars(input).trim().replace(/^(?:#|＃|\/)\s*/, "");
}

function normalizeControlText(input: string) {
  return stripCommandPrefix(input)
    .replace(/[。！？!?,，；;：:、]+$/g, "")
    .trim()
    .replace(/\s+/g, "");
}

export type PrivatePostStartParseOptions = {
  extraKeywords?: string[] | undefined;
  aiIntakeEnabled?: boolean | undefined;
};

export function parsePrivatePostStartText(input: string, options?: PrivatePostStartParseOptions | string[] | undefined) {
  const trimmed = input.trim();
  const extraKeywords = Array.isArray(options) ? options : options?.extraKeywords;

  // 默认支持“投稿”及常见自然表达（也可不带 # 前缀）。
  const startKeywords = ["匿名投稿", "实名投稿", "我要投稿", "我想投稿", "帮我投稿", "墙墙帮我发", "帮我发到墙上", "发到墙上", "投稿"];
  for (const keyword of startKeywords) {
    const match = matchKeyword(trimmed, keyword);
    if (match !== null) return stripZeroWidthChars(match).trim() ? match : "";
    if (matchKeyword(stripZeroWidthChars(trimmed), keyword) === "") return "";
  }

  // 额外的触发关键词（支持 # 前缀）
  if (extraKeywords && extraKeywords.length > 0) {
    for (const kw of extraKeywords) {
      const match = matchKeyword(trimmed, kw);
      if (match !== null) return stripZeroWidthChars(match).trim() ? match : "";
      if (matchKeyword(stripZeroWidthChars(trimmed), kw) === "") return "";
    }
  }

  // 也支持内置关键词不带 # 前缀：直接输入关键词即可触发投稿流程
  const plainKeywords = ["投稿", "墙墙投稿", "墙墙"];
  for (const kw of plainKeywords) {
    if (stripZeroWidthChars(trimmed) === kw) return "";
  }

  return null;
}

export function isPrivatePostFinishText(input: string) {
  return /^(?:结束|结束了|结束投稿|投稿结束|写好|写好了|发完|发完了|完成|完成投稿|提交|提交投稿|发布|发出去|发吧|搞定)$/.test(normalizeControlText(input));
}

export function isPrivatePostCancelText(input: string) {
  return /^(?:取消|取消投稿|取消本次投稿|不投了|不发了|算了|放弃|放弃投稿)$/.test(normalizeControlText(input));
}

export function isPrivatePostUndoText(input: string) {
  return /^(?:撤回|撤回上一条|撤回上一步|删除上一条|删掉刚才|上一条不要了)$/.test(normalizeControlText(input));
}

export function parsePrivatePostModeText(input: string) {
  const normalized = normalizeControlText(input);
  if (/^(?:匿名|匿名投稿|不显示名字|不要显示名字|隐藏名字|隐藏昵称|不公开身份|匿名发)$/.test(normalized)) {
    return { anonymous: true };
  }
  if (/^(?:实名|实名投稿|显示名字|显示昵称|不匿名|公开身份|实名发)$/.test(normalized)) {
    return { anonymous: false };
  }
  return null;
}

export function parsePrivatePostPublishModeText(input: string) {
  const normalized = normalizeControlText(input);
  if (/^(?:单发|单独发布|立即发布|单独发|立即发)$/.test(normalized)) {
    return { publishImmediately: true };
  }
  if (/^(?:批量|批量发布|合并发布|等批量|走批量|不单发)$/.test(normalized)) {
    return { publishImmediately: false };
  }
  return null;
}

export function parsePrivatePostStartModeText(input: string) {
  const trimmed = stripZeroWidthChars(input).trim().replace(/^(?:#|＃|\/)\s*/, "");
  const match = trimmed.match(/^(匿名|实名)投稿(?:$|[\s:：])/);
  if (!match) {
    return null;
  }
  return { anonymous: match[1] === "匿名" };
}

export function parsePrivatePostConfirmText(input: string) {
  const normalized = normalizeControlText(input);
  if (isPrivatePostFinishText(input) || /^(?:确认|确认投稿|确定|可以|没问题|没问题了|发吧|发布|提交|就这样|按这个发|可以发|可以发布|可以提交)$/.test(normalized)) {
    return { confirmed: true };
  }
  if (/^(?:取消|取消提交|取消本次投稿|不发了|不投了|算了|放弃)$/.test(normalized)) {
    return { confirmed: false };
  }
  return null;
}

export function isPrivatePostEditText(input: string) {
  return /^(?:修改|再改一下|重新修改|返回修改|继续修改|先改一下)$/.test(normalizeControlText(input));
}

export function resolvePrivatePostSubmissionText(text: string, attachmentCount: number) {
  const normalized = text.trim();
  return stripZeroWidthChars(normalized).trim() ? normalized : attachmentCount > 0 ? "投稿" : "";
}

export function shouldAutoRegisterPrivateText(text: string) {
  return stripZeroWidthChars(text).trim().length > 0;
}

export type PrivatePostManagementCommand =
  | { name: "history" }
  | { name: "withdraw_list" }
  | { name: "withdraw"; displayId: number; reason: string | null };

export function parsePrivatePostManagementCommand(input: string): PrivatePostManagementCommand | null {
  const normalized = input.trim();
  if (/^(?:#|＃|\/)?\s*(?:历史投稿|稿件)\s*$/.test(normalized)) {
    return { name: "history" };
  }
  if (/^(?:#|＃|\/)?\s*撤回\s*$/.test(normalized)) {
    return { name: "withdraw_list" };
  }

  const withdraw = normalized.match(/^(?:#|＃|\/)?\s*撤回\s*#?(\d+)(?:\s+([\s\S]*\S))?\s*$/);
  if (!withdraw?.[1]) {
    return null;
  }
  const displayId = Number.parseInt(withdraw[1], 10);
  if (!Number.isInteger(displayId) || displayId <= 0) {
    return null;
  }
  return {
    name: "withdraw",
    displayId,
    reason: withdraw[2]?.trim() || null,
  };
}

export function extractOneBotImageSegments(message: unknown) {
  if (!Array.isArray(message)) {
    return [];
  }

  return message.filter((segment): segment is OneBotMessageSegment => {
    if (!segment || typeof segment !== "object") {
      return false;
    }
    return (segment as OneBotMessageSegment).type === "image";
  });
}

/**
 * 提取所有消息段，过滤掉空白的纯 text 段。
 * 用于转发场景，保留 face、image 等非文本段，以便合并转发时正确渲染表情和图片。
 */
export function extractOneBotMessageSegments(message: unknown): OneBotMessageSegment[] {
  if (!Array.isArray(message)) {
    return [];
  }

  return message.filter((segment): segment is OneBotMessageSegment => {
    if (!segment || typeof segment !== "object") {
      return false;
    }
    const seg = segment as OneBotMessageSegment;
    // 过滤掉空白纯文本段（只有空格/换行/零宽字符），保留有实际内容的 text 和所有非 text 段
    if (seg.type === "text") {
      const t = stripZeroWidthChars(String(seg.data?.text ?? "")).trim();
      return t.length > 0;
    }
    return true;
  });
}

export function extractOneBotPlainText(message: unknown, rawMessage?: string) {
  if (Array.isArray(message)) {
    return message
      .map((segment) => {
        const item = segment as OneBotMessageSegment;
        return item.type === "text" ? String(item.data?.text ?? "") : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof message === "string") {
    return message;
  }

  return rawMessage ?? "";
}
