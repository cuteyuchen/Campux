import { describe, expect, test } from "bun:test";
import {
  imageMaxSizeMetadataKey,
  ocrBlockedWordsEnabledKey,
  readTenantOcrBlockedWordsEnabled,
  readTenantImageCompression,
} from "./tenant-metadata";

function metadataClient(entries: Array<{ key: string; value: unknown }>) {
  return {
    tenantMetadata: {
      findMany: async () => entries,
    },
  } as never;
}

function singleValueMetadataClient(value: unknown) {
  return {
    tenantMetadata: {
      findUnique: async () => value === undefined ? null : { value },
    },
  } as never;
}

describe("tenant image upload metadata", () => {
  test("defaults legacy tenants to a 10MB image limit with compression enabled", async () => {
    await expect(readTenantImageCompression(metadataClient([]), "tenant-1")).resolves.toEqual({
      enabled: true,
      quality: 80,
      maxDimension: 2048,
      maxSizeMb: 10,
    });
  });

  test("defaults image OCR blocked-word matching to disabled for existing walls", async () => {
    await expect(readTenantOcrBlockedWordsEnabled(singleValueMetadataClient(undefined), "tenant-1")).resolves.toBe(false);
    await expect(readTenantOcrBlockedWordsEnabled(singleValueMetadataClient(true), "tenant-1")).resolves.toBe(true);
    await expect(readTenantOcrBlockedWordsEnabled(singleValueMetadataClient("1"), "tenant-1")).resolves.toBe(true);
    await expect(readTenantOcrBlockedWordsEnabled(singleValueMetadataClient("false"), "tenant-1")).resolves.toBe(false);
  });

  test("reads the tenant-specific image size limit together with compression settings", async () => {
    await expect(readTenantImageCompression(metadataClient([
      { key: "image_compression_enabled", value: false },
      { key: "image_compression_quality", value: 70 },
      { key: "image_compression_max_dimension", value: 1600 },
      { key: imageMaxSizeMetadataKey, value: 25 },
      { key: ocrBlockedWordsEnabledKey, value: true },
    ]), "tenant-1")).resolves.toEqual({
      enabled: false,
      quality: 70,
      maxDimension: 1600,
      maxSizeMb: 25,
    });
  });
});
