import type { MetadataClient } from "@campux/plugin-content-moderation";
import { findBlockedWords, readTenantBlockedWords } from "@campux/plugin-content-moderation";

export async function findTenantBlockedWordsInText(
  client: MetadataClient,
  tenantId: string,
  text: string,
): Promise<string[]> {
  const blockedWords = await readTenantBlockedWords(client, tenantId);
  return findBlockedWords(text, blockedWords);
}
