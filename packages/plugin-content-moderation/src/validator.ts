import type { PluginContext, PostValidationInput, PostValidationResult } from "@campux/plugin";
import {
  findBlockedWords,
  formatBlockedWordsError,
  formatImageBlockedWordsError,
} from "./blocked-words";
import { OcrUnavailableError } from "./ocr-client";
import { findBlockedWordsInPostImages } from "./ocr-scan";
import { readTenantBlockedWords, readTenantOcrBlockedWordsEnabled } from "./settings";

export async function validatePostModeration(
  ctx: PluginContext,
  input: PostValidationInput,
): Promise<PostValidationResult> {
  const blockedWords = await readTenantBlockedWords(ctx.db, input.tenantId);

  // Empty tenant list never blocks text or images — same as the legacy server path.
  if (blockedWords.length === 0) {
    return { allowed: true };
  }

  const textMatches = findBlockedWords(input.text, blockedWords);
  if (textMatches.length > 0) {
    return {
      allowed: false,
      code: "blocked_words",
      message: formatBlockedWordsError(textMatches),
      statusCode: 400,
    };
  }

  if (input.attachments.length === 0) {
    return { allowed: true };
  }

  const ocrTenantEnabled = await readTenantOcrBlockedWordsEnabled(ctx.db, input.tenantId);
  if (!ctx.config.ocr.enabled || !ocrTenantEnabled) {
    return { allowed: true };
  }

  try {
    const imageMatches = await findBlockedWordsInPostImages({
      config: ctx.config,
      tenantId: input.tenantId,
      attachments: input.attachments,
      blockedWords,
      ocrEnabled: ocrTenantEnabled,
      logger: {
        warn(bindings, message) {
          ctx.logger.warn(message, bindings);
        },
      },
    });
    if (imageMatches.length > 0) {
      return {
        allowed: false,
        code: "image_blocked_words",
        message: formatImageBlockedWordsError(imageMatches),
        statusCode: 400,
      };
    }
    return { allowed: true };
  } catch (error) {
    if (error instanceof OcrUnavailableError) {
      return {
        allowed: false,
        code: "ocr_unavailable",
        message: error.message,
        statusCode: error.status,
      };
    }
    throw error;
  }
}
