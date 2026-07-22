import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const postRoute = readFileSync(new URL("../routes/posts.ts", import.meta.url), "utf8");
const oneBotRuntime = readFileSync(new URL("../runtime/onebot.ts", import.meta.url), "utf8");

describe("OCR submission wiring", () => {
  test("checks website attachments before the post creation transaction", () => {
    const imageCheck = postRoute.indexOf("const imageBlockedWords = await findBlockedWordsInPostImages(");
    const postTransaction = postRoute.indexOf("post = await prisma.$transaction(");
    const attachmentCleanup = postRoute.indexOf("await deleteAttachmentObjects(config, uploadedKeys)");

    expect(imageCheck).toBeGreaterThan(-1);
    expect(postTransaction).toBeGreaterThan(imageCheck);
    expect(attachmentCleanup).toBeGreaterThan(postTransaction);
  });

  test("checks bot draft attachments before persistence and retains a rejected confirmation draft", () => {
    const imageCheck = oneBotRuntime.indexOf("const imageBlockedWords = await findBlockedWordsInPostImages(");
    const postTransaction = oneBotRuntime.indexOf("post = await prisma.$transaction(", imageCheck);
    const pendingDelete = oneBotRuntime.indexOf("this.privatePostPendingConfirms.delete(draftKey);");
    const createCall = oneBotRuntime.indexOf("const result = await this.createPostFromPrivateDraft(");

    expect(imageCheck).toBeGreaterThan(-1);
    expect(postTransaction).toBeGreaterThan(imageCheck);
    expect(createCall).toBeGreaterThan(-1);
    expect(pendingDelete).toBeGreaterThan(createCall);
  });
});
