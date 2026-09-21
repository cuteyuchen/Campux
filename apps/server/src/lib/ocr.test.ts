import { describe, expect, test } from "bun:test";
import type { CampuxConfig } from "@campux/config";
import {
  findBlockedWordsInPostImages,
  OcrUnavailableError,
  recognizeImageWithOcr,
} from "@campux/plugin-content-moderation";

function config(overrides: Partial<CampuxConfig["ocr"]> = {}): CampuxConfig {
  return {
    ocr: {
      enabled: true,
      url: "http://campux-ocr:9001/ocr",
      timeoutMs: 1_000,
      failureMode: "allow",
      ...overrides,
    },
  } as CampuxConfig;
}

describe("ocr compatibility re-exports", () => {
  test("exports the same OCR helpers used by the content moderation plugin", async () => {
    const recognized = await recognizeImageWithOcr({
      config: config(),
      bytes: new Uint8Array([1]),
      fetchImpl: async () => new Response(JSON.stringify({ text: "测试", lines: ["测试"], durationMs: 3 })),
    });
    expect(recognized.text).toBe("测试");

    await expect(findBlockedWordsInPostImages({
      config: config({ failureMode: "block" }),
      tenantId: "tenant-1",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
      blockedWords: ["违禁词"],
      ocrEnabled: true,
      logger: { warn: () => undefined },
      storage: {
        kind: "local",
        ensureReady: async () => undefined,
        put: async () => undefined,
        head: async () => null,
        delete: async () => undefined,
        getBytes: async () => {
          throw new Error("missing");
        },
      },
    })).rejects.toBeInstanceOf(OcrUnavailableError);
  });
});
