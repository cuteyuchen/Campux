import type { Prisma } from "@campux/db";
import type { PrismaClientType } from "@campux/db";
import { normalizeBlockedWords, blockedWordsMetadataKey as blockedWordsKey } from "./blocked-words";

export type MetadataClient = Pick<PrismaClientType, "tenantMetadata"> | Prisma.TransactionClient;

export const blockedWordsMetadataKey = blockedWordsKey;
export const ocrBlockedWordsEnabledKey = "ocr_blocked_words_enabled";
export const ocrBlockedWordsEnabledDefault = false;

export function normalizeOcrBlockedWordsEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return ocrBlockedWordsEnabledDefault;
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

export async function readTenantOcrBlockedWordsEnabled(client: MetadataClient, tenantId: string): Promise<boolean> {
  const entry = await client.tenantMetadata.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key: ocrBlockedWordsEnabledKey,
      },
    },
    select: {
      value: true,
    },
  });

  return normalizeOcrBlockedWordsEnabled(entry?.value);
}
