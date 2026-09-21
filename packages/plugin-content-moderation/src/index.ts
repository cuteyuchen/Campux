import type { CampuxPlugin } from "@campux/plugin";
import { validatePostModeration } from "./validator";

/**
 * 内容审核插件：投稿写入前的文字违禁词 + 图片 OCR 违禁词校验。
 * OCR Sidecar 是外部推理服务，不属于本插件进程。
 */
export const contentModerationPlugin: CampuxPlugin = {
  name: "campux-plugin-content-moderation",
  version: "1.0.0",
  description: "投稿内容审核插件：文字违禁词与图片 OCR 违禁词校验",
  enabledByDefault: true,
  permissions: {
    required: ["db:read", "config:read", "tenant:data", "events:listen"],
    riskLevel: "medium",
    rationale: "读取校园墙违禁词/OCR 开关配置，并在投稿写入前调用 OCR sidecar 做图片文字审核",
  },
  validators: {
    beforePostCreate: validatePostModeration,
  },
};

export {
  blockedWordsMetadataKey,
  findBlockedWords,
  formatBlockedWordsError,
  formatImageBlockedWordsError,
  maxBlockedWordLength,
  maxBlockedWords,
  normalizeBlockedWords,
} from "./blocked-words";
export {
  normalizeOcrBlockedWordsEnabled,
  ocrBlockedWordsEnabledDefault,
  ocrBlockedWordsEnabledKey,
  readTenantBlockedWords,
  readTenantOcrBlockedWordsEnabled,
  type MetadataClient,
} from "./settings";
export { findBlockedWordsInPostImages } from "./ocr-scan";
export {
  OcrUnavailableError,
  recognizeImageWithOcr,
  type OcrRecognition,
} from "./ocr-client";
export { validatePostModeration } from "./validator";
