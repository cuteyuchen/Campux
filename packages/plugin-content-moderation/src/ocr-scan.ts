import type { CampuxConfig } from "@campux/config";
import { getStorageDriver, type StorageDriver } from "@campux/integrations";
import { findBlockedWords } from "./blocked-words";
import { OcrUnavailableError, recognizeImageWithOcr, type OcrRecognition } from "./ocr-client";

type OcrLogger = {
  warn: (bindings: Record<string, unknown>, message: string) => void;
};

type OcrImage = {
  key: string;
  fileName?: string | undefined;
  contentType?: string | undefined;
};

export async function findBlockedWordsInPostImages({
  config,
  tenantId,
  attachments,
  blockedWords,
  ocrEnabled,
  logger,
  storage,
  recognize = recognizeImageWithOcr,
}: {
  config: CampuxConfig;
  tenantId: string;
  attachments: OcrImage[];
  blockedWords: string[];
  ocrEnabled: boolean;
  logger: OcrLogger;
  storage?: StorageDriver;
  recognize?: (input: {
    config: CampuxConfig;
    bytes: Uint8Array;
    contentType?: string | undefined;
    fileName?: string | undefined;
  }) => Promise<OcrRecognition>;
}): Promise<string[]> {
  if (!config.ocr.enabled || !ocrEnabled || attachments.length === 0 || blockedWords.length === 0) {
    return [];
  }
  if (!config.ocr.url) {
    if (config.ocr.failureMode === "block") {
      throw new OcrUnavailableError();
    }
    logger.warn({
      tenantId,
      attachmentCount: attachments.length,
      durationMs: 0,
      errorType: "OcrConfigurationError",
    }, "OCR service URL is missing; allowing post because failure mode is allow");
    return [];
  }

  const resolvedStorage = storage ?? getStorageDriver(config);
  const textParts: string[] = [];
  for (const attachment of attachments) {
    const startedAt = Date.now();
    try {
      const object = await resolvedStorage.getBytes(attachment.key);
      if (!object) {
        throw new Error("投稿图片不存在");
      }
      const recognition = await recognize({
        config,
        bytes: object.bytes,
        contentType: object.contentType ?? attachment.contentType,
        fileName: attachment.fileName,
      });
      textParts.push(recognition.text);
    } catch (error) {
      if (config.ocr.failureMode === "block") {
        throw new OcrUnavailableError();
      }
      logger.warn({
        tenantId,
        attachmentKey: attachment.key,
        attachmentCount: attachments.length,
        durationMs: Date.now() - startedAt,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }, "OCR image scan failed; allowing post because failure mode is allow");
    }
  }

  return findBlockedWords(textParts.join("\n"), blockedWords);
}
