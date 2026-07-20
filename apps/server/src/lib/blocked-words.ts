import { Prisma } from "@campux/db";
import { prisma } from "./prisma";

type MetadataClient = typeof prisma | Prisma.TransactionClient;

export const blockedWordsMetadataKey = "blocked_words";
export const maxBlockedWordLength = 50;
export const maxBlockedWords = 200;

function normalizeForMatch(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

export function normalizeBlockedWords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") continue;

    const word = entry.trim();
    if (!word || Array.from(word).length > maxBlockedWordLength) continue;

    const matchKey = normalizeForMatch(word);
    if (seen.has(matchKey)) continue;

    seen.add(matchKey);
    normalized.push(word);
    if (normalized.length >= maxBlockedWords) break;
  }

  return normalized;
}

export function findBlockedWords(text: string, blockedWords: unknown): string[] {
  const normalizedText = normalizeForMatch(text);
  return normalizeBlockedWords(blockedWords).filter((word) => normalizedText.includes(normalizeForMatch(word)));
}

export function formatBlockedWordsError(blockedWords: string[]): string {
  return `当前投稿含有违禁词，不可提交：${blockedWords.join("、")}`;
}

export async function readTenantBlockedWords(client: MetadataClient, tenantId: string): Promise<string[]> {
  const entry = await client.tenantMetadata.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key: blockedWordsMetadataKey,
      },
    },
    select: {
      value: true,
    },
  });

  return normalizeBlockedWords(entry?.value);
}

export async function findTenantBlockedWordsInText(client: MetadataClient, tenantId: string, text: string): Promise<string[]> {
  const blockedWords = await readTenantBlockedWords(client, tenantId);
  return findBlockedWords(text, blockedWords);
}
