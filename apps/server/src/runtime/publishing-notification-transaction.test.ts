import { describe, expect, test } from "bun:test";
import { refreshAttemptPostStatusesAndNotify } from "./publishing";

function createFixture(options: {
  batch?: boolean;
  inactive?: boolean;
  commitFails?: boolean;
  alreadyPublished?: boolean;
  claimLost?: boolean;
} = {}) {
  let transactionOpen = false;
  const events: string[] = [];
  const posts = (options.batch ? ["post-1", "post-2"] : ["post-1"]).map((id) => ({
    id,
    tenantId: "tenant-1",
    status: options.alreadyPublished ? "published" : "publishing",
    logs: [],
    authorId: "author-1",
    author: { autoFollowOwnPosts: true },
    qzonePostMetrics: [],
    publishAttempts: [{ status: "succeeded", publishTarget: { required: true } }],
  }));
  const transaction = {
    $executeRaw: async () => 1,
    tenant: { findUnique: async () => ({ status: options.inactive ? "paused" : "active" }) },
    post: {
      findUnique: async ({ where }: { where: { id: string } }) => posts.find((post) => post.id === where.id),
      updateMany: async () => ({ count: options.claimLost ? 0 : 1 }),
    },
    postLog: { create: async () => ({}) },
    postFollow: { upsert: async () => events.push("follow") },
    publishBatch: {
      findUnique: async () => ({
        id: "batch-1",
        status: "publishing",
        flushedAt: new Date(),
        items: posts.map((post) => ({ post })),
        attempts: posts[0]!.publishAttempts,
      }),
      updateMany: async () => {
        events.push("batch");
        return { count: 1 };
      },
    },
  };
  const client = {
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => {
      transactionOpen = true;
      try {
        const result = await operation(transaction);
        if (options.commitFails) {
          throw new Error("commit failed");
        }
        events.push("commit");
        return result;
      } finally {
        transactionOpen = false;
      }
    },
  };
  const notifier = {
    notifyAuthorPublishSucceeded: async (postId: string) => {
      expect(transactionOpen).toBe(false);
      events.push(`notify:${postId}`);
    },
  };
  const attempt = {
    tenantId: "tenant-1",
    postId: "post-1",
    batchId: options.batch ? "batch-1" : null,
  };
  return { events, notifier, run: () => refreshAttemptPostStatusesAndNotify(attempt, notifier, client as never) };
}

describe("publish author notifications after commit", () => {
  test("releases the tenant lock before notifying a single post's author", async () => {
    const fixture = createFixture();
    await fixture.run();
    expect(fixture.events).toEqual(["follow", "commit", "notify:post-1"]);
  });

  test("commits the entire batch before notifying any author", async () => {
    const fixture = createFixture({ batch: true });
    await fixture.run();
    expect(fixture.events).toEqual(["follow", "follow", "batch", "commit", "notify:post-1", "notify:post-2"]);
  });

  test("does not notify when the status transaction rolls back", async () => {
    const fixture = createFixture({ commitFails: true });
    await expect(fixture.run()).rejects.toThrow("commit failed");
    expect(fixture.events).toEqual(["follow"]);
  });

  test("does not notify for inactive tenants or unchanged or unclaimed statuses", async () => {
    for (const options of [{ inactive: true }, { alreadyPublished: true }, { claimLost: true }]) {
      const fixture = createFixture(options);
      await fixture.run();
      expect(fixture.events).toEqual(["commit"]);
    }
  });

  test("a failed notification does not roll back publication or skip the next author", async () => {
    const fixture = createFixture({ batch: true });
    fixture.notifier.notifyAuthorPublishSucceeded = async (postId: string) => {
      fixture.events.push(`notify:${postId}`);
      throw new Error("bot offline");
    };
    await fixture.run();
    expect(fixture.events).toEqual(["follow", "follow", "batch", "commit", "notify:post-1", "notify:post-2"]);
  });
});
