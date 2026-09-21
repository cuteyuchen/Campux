import { describe, expect, test } from "bun:test";
import {
  findBlockedWords,
  formatBlockedWordsError,
  formatImageBlockedWordsError,
  normalizeBlockedWords,
  readTenantBlockedWords,
} from "@campux/plugin-content-moderation";
import { findTenantBlockedWordsInText } from "./blocked-words-compat";

function metadataClient(value: unknown) {
  return {
    tenantMetadata: {
      findUnique: async () => value === undefined ? null : { value },
    },
  } as never;
}

describe("blocked words compatibility re-exports", () => {
  test("normalizes empty entries and duplicate words", () => {
    expect(normalizeBlockedWords(["  违禁词  ", "", "违禁词", "TEST", "test", null])).toEqual(["违禁词", "TEST"]);
  });

  test("matches Chinese substrings and English without case sensitivity", () => {
    expect(findBlockedWords("这是一条违禁词内容，包含 TeSt。", ["违禁词", "test", "未命中"])).toEqual(["违禁词", "test"]);
  });

  test("uses Unicode compatibility normalization", () => {
    expect(findBlockedWords("正文包含ＡＢＣ", ["abc"])).toEqual(["abc"]);
  });

  test("keeps admin settings helpers and error text stable", async () => {
    await expect(readTenantBlockedWords(metadataClient(undefined), "tenant-1")).resolves.toEqual([]);
    const matches = await findTenantBlockedWordsInText(metadataClient(["词A", "词B"]), "tenant-1", "正文有词A，也有词B");
    expect(matches).toEqual(["词A", "词B"]);
    expect(formatBlockedWordsError(matches)).toBe("当前投稿含有违禁词，不可提交：词A、词B");
    expect(formatImageBlockedWordsError(matches)).toBe("当前投稿图片含有违禁词，不可提交：词A、词B");
  });
});
