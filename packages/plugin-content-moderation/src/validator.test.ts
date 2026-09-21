import { describe, expect, test } from "bun:test";
import type { PluginContext } from "@campux/plugin";
import { validatePostModeration } from "./validator";

type MetadataEntry = { value: unknown };

function createCtx({
  blockedWords,
  ocrEnabled = false,
  ocrConfig = {
    enabled: true,
    url: "http://campux-ocr:9001/ocr",
    timeoutMs: 1000,
    failureMode: "allow" as const,
  },
  recognize,
  storageGetBytes,
}: {
  blockedWords: unknown;
  ocrEnabled?: boolean;
  ocrConfig?: PluginContext["config"]["ocr"];
  recognize?: () => Promise<{ text: string; lines: string[]; durationMs: number }>;
  storageGetBytes?: (key: string) => Promise<{ bytes: Uint8Array } | null>;
}) {
  const values: Record<string, unknown> = {
    blocked_words: blockedWords,
    ocr_blocked_words_enabled: ocrEnabled,
  };
  return {
    config: {
      ocr: ocrConfig,
      storage: { driver: "local", localDir: "/tmp" },
    },
    db: {
      tenantMetadata: {
        findUnique: async ({ where }: { where: { tenantId_key: { key: string } } }) => {
          const value = values[where.tenantId_key.key];
          return value === undefined ? null : { value } as MetadataEntry;
        },
      },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  } as unknown as PluginContext;
}

describe("content moderation validator", () => {
  test("rejects text blocked words with 400", async () => {
    const result = await validatePostModeration(createCtx({ blockedWords: ["违禁词"] }), {
      tenantId: "t1",
      source: "web",
      text: "这里有违禁词",
      attachments: [],
    });
    expect(result).toMatchObject({
      allowed: false,
      code: "blocked_words",
      statusCode: 400,
    });
  });

  test("allows when blocked word list is empty", async () => {
    const result = await validatePostModeration(createCtx({ blockedWords: [] }), {
      tenantId: "t1",
      source: "onebot",
      text: "随便写点什么",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
    });
    expect(result).toEqual({ allowed: true });
  });

  test("allows clean text when list is configured", async () => {
    const result = await validatePostModeration(createCtx({ blockedWords: ["违禁词"] }), {
      tenantId: "t1",
      source: "web",
      text: "普通投稿",
      attachments: [],
    });
    expect(result).toEqual({ allowed: true });
  });

  test("same validator path is used for web and onebot sources", async () => {
    const ctx = createCtx({ blockedWords: ["广告"] });
    for (const source of ["web", "onebot"] as const) {
      const rejected = await validatePostModeration(ctx, {
        tenantId: "t1",
        source,
        text: "硬广告",
        attachments: [],
      });
      expect(rejected).toMatchObject({ allowed: false, code: "blocked_words" });
      const allowed = await validatePostModeration(ctx, {
        tenantId: "t1",
        source,
        text: "正常内容",
        attachments: [],
      });
      expect(allowed).toEqual({ allowed: true });
    }
  });
});
