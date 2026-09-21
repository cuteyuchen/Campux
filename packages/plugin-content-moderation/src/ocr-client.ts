import type { CampuxConfig } from "@campux/config";

type OcrResponse = {
  text?: unknown;
  lines?: unknown;
  durationMs?: unknown;
};

type OcrFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type OcrRecognition = {
  text: string;
  lines: string[];
  durationMs: number;
};

export class OcrUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super("图片内容检测暂不可用，请稍后重试");
    this.name = "OcrUnavailableError";
  }
}

function normalizeLines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];
}

function parseOcrResponse(payload: OcrResponse): OcrRecognition {
  if (typeof payload.text !== "string" && !Array.isArray(payload.lines)) {
    throw new Error("OCR 响应格式无效");
  }
  const lines = normalizeLines(payload.lines);
  const text = typeof payload.text === "string" ? payload.text : lines.join("\n");

  return {
    text,
    lines,
    durationMs: typeof payload.durationMs === "number" && Number.isFinite(payload.durationMs)
      ? Math.max(0, Math.floor(payload.durationMs))
      : 0,
  };
}

export async function recognizeImageWithOcr({
  config,
  bytes,
  contentType,
  fileName,
  fetchImpl = fetch as OcrFetch,
}: {
  config: CampuxConfig;
  bytes: Uint8Array;
  contentType?: string | undefined;
  fileName?: string | undefined;
  fetchImpl?: OcrFetch;
}): Promise<OcrRecognition> {
  if (!config.ocr.url) {
    throw new Error("OCR 服务地址未配置");
  }

  const form = new FormData();
  form.append(
    "image",
    new Blob([Uint8Array.from(bytes)], { type: contentType || "application/octet-stream" }),
    fileName || "attachment.jpg",
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ocr.timeoutMs);

  try {
    const response = await fetchImpl(config.ocr.url, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`OCR 服务返回 ${response.status}`);
    }
    return parseOcrResponse(await response.json() as OcrResponse);
  } finally {
    clearTimeout(timer);
  }
}
