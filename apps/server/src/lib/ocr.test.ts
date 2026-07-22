import { describe, expect, test } from "bun:test";
import type { CampuxConfig } from "@campux/config";
import {
  findBlockedWordsInPostImages,
  OcrUnavailableError,
  recognizeImageWithOcr,
} from "./ocr";

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

function logger() {
  const warnings: Array<{ bindings: Record<string, unknown>; message: string }> = [];
  return {
    warnings,
    warn(bindings: Record<string, unknown>, message: string) {
      warnings.push({ bindings, message });
    },
  };
}

describe("post image OCR", () => {
  test("matches all blocked words across multiple recognized images", async () => {
    const log = logger();
    const matches = await findBlockedWordsInPostImages({
      config: config(),
      tenantId: "tenant-1",
      attachments: [
        { key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" },
        { key: "b.jpg", fileName: "b.jpg", contentType: "image/jpeg" },
      ],
      blockedWords: ["违禁词", "test", "未命中"],
      ocrEnabled: true,
      logger: log,
      storage: {
        kind: "local",
        ensureReady: async () => undefined,
        put: async () => undefined,
        head: async () => null,
        delete: async () => undefined,
        getBytes: async (key) => ({ bytes: new TextEncoder().encode(key) }),
      },
      recognize: async ({ fileName }) => ({
        text: fileName === "a.jpg" ? "图片中有违禁词" : "English TeSt",
        lines: [],
        durationMs: 12,
      }),
    });

    expect(matches).toEqual(["违禁词", "test"]);
    expect(log.warnings).toEqual([]);
  });

  test("allows the post and records a safe warning when OCR fails", async () => {
    const log = logger();
    const matches = await findBlockedWordsInPostImages({
      config: config(),
      tenantId: "tenant-1",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
      blockedWords: ["违禁词"],
      ocrEnabled: true,
      logger: log,
      storage: {
        kind: "local",
        ensureReady: async () => undefined,
        put: async () => undefined,
        head: async () => null,
        delete: async () => undefined,
        getBytes: async () => ({ bytes: new Uint8Array([1]) }),
      },
      recognize: async () => {
        throw new Error("service unavailable");
      },
    });

    expect(matches).toEqual([]);
    expect(log.warnings).toHaveLength(1);
    expect(log.warnings[0]?.bindings).toMatchObject({
      tenantId: "tenant-1",
      attachmentCount: 1,
      errorType: "Error",
    });
  });

  test("supports a blocking failure mode for an explicit future opt-in", async () => {
    const log = logger();
    await expect(findBlockedWordsInPostImages({
      config: config({ failureMode: "block" }),
      tenantId: "tenant-1",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
      blockedWords: ["违禁词"],
      ocrEnabled: true,
      logger: log,
      storage: {
        kind: "local",
        ensureReady: async () => undefined,
        put: async () => undefined,
        head: async () => null,
        delete: async () => undefined,
        getBytes: async () => {
          throw new Error("object missing");
        },
      },
    })).rejects.toBeInstanceOf(OcrUnavailableError);
  });

  test("skips the OCR service when the campus wall switch is disabled", async () => {
    const log = logger();
    const matches = await findBlockedWordsInPostImages({
      config: config(),
      tenantId: "tenant-1",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
      blockedWords: ["违禁词"],
      ocrEnabled: false,
      logger: log,
      storage: {
        kind: "local",
        ensureReady: async () => undefined,
        put: async () => undefined,
        head: async () => null,
        delete: async () => undefined,
        getBytes: async () => {
          throw new Error("OCR must not read storage");
        },
      },
    });

    expect(matches).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("logs and allows when OCR is globally enabled without a configured URL", async () => {
    const log = logger();
    const matches = await findBlockedWordsInPostImages({
      config: config({ url: undefined }),
      tenantId: "tenant-1",
      attachments: [{ key: "a.jpg", fileName: "a.jpg", contentType: "image/jpeg" }],
      blockedWords: ["违禁词"],
      ocrEnabled: true,
      logger: log,
    });

    expect(matches).toEqual([]);
    expect(log.warnings[0]?.bindings).toMatchObject({ errorType: "OcrConfigurationError" });
  });

  test("parses a successful OCR HTTP response and rejects service errors", async () => {
    const recognized = await recognizeImageWithOcr({
      config: config(),
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
      fileName: "test.jpg",
      fetchImpl: async () => new Response(JSON.stringify({ text: "测试", lines: ["测试"], durationMs: 23 })),
    });
    expect(recognized).toEqual({ text: "测试", lines: ["测试"], durationMs: 23 });

    const empty = await recognizeImageWithOcr({
      config: config(),
      bytes: new Uint8Array([1]),
      fetchImpl: async () => new Response(JSON.stringify({ text: "", lines: [], durationMs: 4 })),
    });
    expect(empty).toEqual({ text: "", lines: [], durationMs: 4 });

    await expect(recognizeImageWithOcr({
      config: config(),
      bytes: new Uint8Array([1]),
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    })).rejects.toThrow("OCR 服务返回 503");
  });
});
