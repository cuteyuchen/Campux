/**
 * Compatibility re-exports for admin metadata routes and tests.
 * Actual moderation logic lives in @campux/plugin-content-moderation.
 */
export {
  blockedWordsMetadataKey,
  findBlockedWords,
  formatBlockedWordsError,
  formatImageBlockedWordsError,
  maxBlockedWordLength,
  maxBlockedWords,
  normalizeBlockedWords,
  readTenantBlockedWords,
  type MetadataClient,
} from "@campux/plugin-content-moderation";

export { findTenantBlockedWordsInText } from "./blocked-words-compat";
