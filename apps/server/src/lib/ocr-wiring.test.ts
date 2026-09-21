import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const postRoute = readFileSync(new URL("../routes/posts.ts", import.meta.url), "utf8");
const oneBotRuntime = readFileSync(new URL("../runtime/onebot.ts", import.meta.url), "utf8");
const serverIndex = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

describe("content moderation submission wiring", () => {
  test("checks website submissions via plugin validation before the post transaction", () => {
    const imageCheck = postRoute.indexOf("validatePostBeforeCreate(");
    const postTransaction = postRoute.indexOf("post = await prisma.$transaction(");
    const attachmentCleanup = postRoute.indexOf("await deleteAttachmentObjects(config, uploadedKeys)");
    const usesLegacyOcr = postRoute.includes("findBlockedWordsInPostImages");
    const usesLegacyBlocked = postRoute.includes("findBlockedWords(") || postRoute.includes('from "../lib/blocked-words"');

    expect(imageCheck).toBeGreaterThan(-1);
    expect(postTransaction).toBeGreaterThan(imageCheck);
    expect(attachmentCleanup).toBeGreaterThan(postTransaction);
    expect(usesLegacyOcr).toBe(false);
    expect(usesLegacyBlocked).toBe(false);
  });

  test("checks bot draft submissions via plugin validation before persistence", () => {
    const validationCall = oneBotRuntime.indexOf("validatePostBeforeCreate(");
    const helper = oneBotRuntime.indexOf("private async validatePrivatePostSubmission(");
    const postTransaction = oneBotRuntime.indexOf("post = await prisma.$transaction(", validationCall);
    const pendingDelete = oneBotRuntime.indexOf("this.privatePostPendingConfirms.delete(draftKey);");
    const createCall = oneBotRuntime.indexOf("const result = await this.createPostFromPrivateDraft(");
    const usesLegacyOcr = oneBotRuntime.includes("findBlockedWordsInPostImages");
    const usesLegacyBlocked = oneBotRuntime.includes('from "../lib/blocked-words"');

    expect(helper).toBeGreaterThan(-1);
    expect(validationCall).toBeGreaterThan(helper);
    expect(postTransaction).toBeGreaterThan(validationCall);
    expect(createCall).toBeGreaterThan(-1);
    expect(pendingDelete).toBeGreaterThan(createCall);
    expect(usesLegacyOcr).toBe(false);
    expect(usesLegacyBlocked).toBe(false);
  });

  test("registers the content moderation plugin before review notify", () => {
    const moderation = serverIndex.indexOf("contentModerationPlugin");
    const review = serverIndex.indexOf("reviewNotifyPlugin");
    const registerModeration = serverIndex.indexOf("pluginRegistry.register(contentModerationPlugin)");
    const registerReview = serverIndex.indexOf("pluginRegistry.register(reviewNotifyPlugin)");

    expect(registerModeration).toBeGreaterThan(-1);
    expect(registerReview).toBeGreaterThan(registerModeration);
    expect(moderation).toBeGreaterThan(-1);
    expect(review).toBeGreaterThan(-1);
  });
});
