import { describe, expect, test } from "bun:test";
import {
  findBlockedWords,
  findTenantBlockedWordsInText,
  formatBlockedWordsError,
  formatImageBlockedWordsError,
  normalizeBlockedWords,
} from "./blocked-words";

function metadataClient(value: unknown) {
  return {
    tenantMetadata: {
      findUnique: async () => value === undefined ? null : { value },
    },
  } as never;
}

describe("blocked words", () => {
  test("normalizes empty entries and duplicate words", () => {
    expect(normalizeBlockedWords(["  违禁词  ", "", "违禁词", "TEST", "test", null])).toEqual(["违禁词", "TEST"]);
  });

  test("drops overlong words and caps the normalized list", () => {
    const words = ["超".repeat(51), ...Array.from({ length: 205 }, (_, index) => `词${index}`)];
    const normalized = normalizeBlockedWords(words);
    expect(normalized).toHaveLength(200);
    expect(normalized[0]).toBe("词0");
    expect(normalized[199]).toBe("词199");
  });

  test("matches Chinese substrings and English without case sensitivity", () => {
    expect(findBlockedWords("这是一条违禁词内容，包含 TeSt。", ["违禁词", "test", "未命中"])).toEqual(["违禁词", "test"]);
  });

  test("uses Unicode compatibility normalization", () => {
    expect(findBlockedWords("正文包含ＡＢＣ", ["abc"])).toEqual(["abc"]);
  });

  test("does not ignore spaces or punctuation", () => {
    expect(findBlockedWords("敏 感", ["敏感"])).toEqual([]);
  });

  test("returns an empty list when tenant metadata is missing", async () => {
    await expect(findTenantBlockedWordsInText(metadataClient(undefined), "tenant-1", "普通投稿")).resolves.toEqual([]);
  });

  test("reads tenant metadata and formats all matches", async () => {
    const matches = await findTenantBlockedWordsInText(metadataClient(["词A", "词B"]), "tenant-1", "正文有词A，也有词B");
    expect(matches).toEqual(["词A", "词B"]);
    expect(formatBlockedWordsError(matches)).toBe("当前投稿含有违禁词，不可提交：词A、词B");
    expect(formatImageBlockedWordsError(matches)).toBe("当前投稿图片含有违禁词，不可提交：词A、词B");
  });
});
