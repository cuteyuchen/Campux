/**
 * Compatibility re-exports. OCR moderation lives in @campux/plugin-content-moderation.
 */
export {
  findBlockedWordsInPostImages,
  OcrUnavailableError,
  recognizeImageWithOcr,
  type OcrRecognition,
} from "@campux/plugin-content-moderation";
