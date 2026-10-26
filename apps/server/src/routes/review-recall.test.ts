import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import Fastify, { type FastifyInstance } from "fastify";
import type { PostStatus, TenantRole } from "@campux/db";
import * as integrations from "@campux/integrations";
import { executePostRecall } from "../lib/post-recall";
import { prisma } from "../lib/prisma";
import { registerReviewRoutes } from "./review";

const originalPrisma = prisma;
const apps: FastifyInstance[] = [];
const spies: Array<{ mockRestore(): void }> = [];

function track<T extends { mockRestore(): void }>(spy: T): T {
  spies.push(spy);
  return spy;
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const spy of spies.splice(0).reverse()) spy.mockRestore();
  mock.module("../lib/prisma", () => ({ prisma: originalPrisma }));
});

function createFixture(options: {
  role?: TenantRole;
  status?: PostStatus;
  targetCount?: number;
  batchSize?: number;
  missing?: boolean;
  inactive?: boolean;
} = {}) {
  const tenant = { id: "tenant-1", status: options.inactive ? "paused" : "active", readyAt: new Date() };
  const post = {
    id: "post-1",
    displayId: 12,
    tenantId: tenant.id,
    status: options.status ?? "published",
    publishAttempts: Array.from({ length: options.targetCount ?? 0 }, (_, index) => ({
      id: `attempt-${index}`,
      qzoneTid: `tid-${index}`,
      externalId: null,
      verbose: {},
      publishTargetId: `target-${index}`,
      publishTarget: {
        displayName: `QQ 空间 ${index}`,
        botAccount: {
          platform: "onebot",
          sessions: [{ healthStatus: "available", cookies: {} }],
        },
      },
    })),
  };
  const session = {
    selectedTenantId: tenant.id,
    selectedTenant: tenant,
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "reviewer-1",
      systemRole: null,
      passwordChangeRequired: false,
      memberships: [{ id: "membership-1", tenantId: tenant.id, role: options.role ?? "reviewer" }],
    },
  };
  const findPost = mock(async (_args: unknown) => options.missing ? null : post);

  const updatePost = mock(async ({ data }: { data: unknown }) => ({ ...post, status: "recalled", data }));
  const audit = mock(async (_args: { data: unknown }) => ({}));
  const transaction = {
    $executeRaw: async () => 1,
    tenant: { findUnique: async () => tenant },
    publishBatchItem: { findUnique: async () => ({ batch: { _count: { items: options.batchSize ?? 1 } } }) },
    post: { findFirst: async () => post, update: updatePost },
    postLog: { create: mock(async () => ({})) },
    publishAttempt: { update: mock(async () => ({})) },
    auditLog: { create: audit },
  };
  const runTransaction = mock(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction));
  // Restore the live singleton after each test so other suites keep their real client.
  mock.module("../lib/prisma", () => ({
    prisma: {
      accountSession: { findUnique: async () => session },
      tenant: { findFirst: async () => null },
      banRecord: { findFirst: async () => null },
      post: { findFirst: findPost },
      $transaction: runTransaction,
    },
  }));
  const recallTarget = track(spyOn(integrations, "setQZoneEmotionPrivate")).mockResolvedValue({ verbose: {} } as never);
  const notifier = {
    notifyPostRecalled: mock(async (_postId: string, _targetCount: number, _opts: unknown) => undefined),
    notifyPostRecallFailed: mock(async (_postId: string, _results: unknown) => undefined),
  };
  const app = Fastify({ logger: false });
  apps.push(app);
  registerReviewRoutes(app, {} as never, notifier as never);
  const request = (payload: unknown = { reason: "内容包含隐私信息" }) => app.inject({
    method: "POST",
    url: `/api/review/posts/${post.id}/recall/admin`,
    headers: { cookie: "campux_session=test-session" },
    payload: payload as never,
  });
  return { app, post, request, findPost, runTransaction, recallTarget, updatePost, audit, notifier };
}

describe("direct recall permissions and validation", () => {
  for (const role of ["reviewer", "admin"] as const) {
    for (const silent of [false, true]) {
      test(`${role} can recall a published post with silent=${silent} and a trimmed reason`, async () => {
        const fixture = createFixture({ role });
        const response = await fixture.request({ reason: "  内容包含隐私信息\n", silent });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ ok: true, silent, results: [] });
        expect(fixture.updatePost).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            status: "recalled",
            logs: { create: expect.objectContaining({ actorId: "reviewer-1", comment: "主动撤回：内容包含隐私信息" }) },
          }),
        }));
        expect(fixture.audit).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: "post.recall.complete",
            actorId: "reviewer-1",
            detail: expect.objectContaining({ displayId: 12, results: [], reason: "内容包含隐私信息" }),
          }),
        });
        expect(fixture.notifier.notifyPostRecalled).toHaveBeenCalledWith(fixture.post.id, 0, { skipAuthor: silent, reason: "内容包含隐私信息" });
      });
    }
  }

  test("submitters cannot directly recall posts", async () => {
    const fixture = createFixture({ role: "submitter" });
    expect((await fixture.request()).statusCode).toBe(403);
    expect(fixture.findPost).not.toHaveBeenCalled();
    expect(fixture.runTransaction).not.toHaveBeenCalled();
  });

  test("paused walls cannot recall posts", async () => {
    const fixture = createFixture({ inactive: true });
    expect((await fixture.request()).statusCode).toBe(403);
    expect(fixture.runTransaction).not.toHaveBeenCalled();
  });

  test("rejects missing, blank, invalid and overlong reasons before any recall", async () => {
    const fixture = createFixture();
    for (const reason of [undefined, null, 123, "", " \t\n　", "字".repeat(501)]) {
      for (const silent of [false, true]) {
        const response = await fixture.request({ reason, silent });
        expect(response.statusCode).toBe(400);
        if (typeof reason === "string" && reason.trim().length === 0) {
          expect(response.json().message).toBe("请填写撤回理由");
        }
      }
    }
    expect(fixture.findPost).not.toHaveBeenCalled();
    expect(fixture.runTransaction).not.toHaveBeenCalled();
    expect(fixture.notifier.notifyPostRecalled).not.toHaveBeenCalled();
  });

  test("accepts a 500-character reason after trimming", async () => {
    const fixture = createFixture();
    expect((await fixture.request({ reason: ` ${"字".repeat(500)} ` })).statusCode).toBe(200);
  });

  test("scopes post lookup to the current wall", async () => {
    const fixture = createFixture({ missing: true });
    expect((await fixture.request()).statusCode).toBe(404);
    expect(fixture.findPost).toHaveBeenCalledWith({ where: { id: fixture.post.id, tenantId: "tenant-1" } });
    expect(fixture.runTransaction).not.toHaveBeenCalled();
  });

  for (const status of ["pending_approval", "pending_recall", "recalled"] as const) {
    test(`rejects posts in ${status} status`, async () => {
      const fixture = createFixture({ status });
      expect((await fixture.request()).statusCode).toBe(409);
      expect(fixture.runTransaction).not.toHaveBeenCalled();
    });
  }
});

describe("direct recall execution", () => {
  test("recalls every external target and records the reason", async () => {
    const fixture = createFixture({ targetCount: 2 });
    const response = await fixture.request({ reason: "内容有误" });
    expect(response.statusCode).toBe(200);
    expect(fixture.recallTarget).toHaveBeenCalledTimes(2);
    expect(fixture.recallTarget).toHaveBeenCalledWith(expect.objectContaining({ externalId: "tid-0" }));
    expect(fixture.recallTarget).toHaveBeenCalledWith(expect.objectContaining({ externalId: "tid-1" }));
    expect(fixture.updatePost).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ logs: { create: expect.objectContaining({ comment: "主动撤回：内容有误" }) } }),
    }));
    expect(fixture.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "post.recall.complete",
        detail: expect.objectContaining({ reason: "内容有误", results: [expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })] }),
      }),
    });
    expect(fixture.notifier.notifyPostRecalled).toHaveBeenCalledWith(fixture.post.id, 2, { skipAuthor: false, reason: "内容有误" });
  });

  test("does not mark the post recalled or send success notifications after a target fails", async () => {
    const fixture = createFixture({ targetCount: 2 });
    fixture.recallTarget.mockRejectedValueOnce(new Error("QQ 空间不可用"));
    const response = await fixture.request({ reason: "内容有误" });
    expect(response.statusCode).toBe(502);
    expect(fixture.recallTarget).toHaveBeenCalledTimes(2);
    expect(fixture.updatePost).not.toHaveBeenCalled();
    expect(fixture.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "post.recall.failed", detail: expect.objectContaining({ reason: "内容有误" }) }),
    });
    expect(fixture.notifier.notifyPostRecalled).not.toHaveBeenCalled();
    expect(fixture.notifier.notifyPostRecallFailed).toHaveBeenCalledTimes(1);
  });

  test("retains the existing safeguard for batch publications", async () => {
    const fixture = createFixture({ batchSize: 2, targetCount: 1 });
    expect((await fixture.request()).statusCode).toBe(409);
    expect(fixture.recallTarget).not.toHaveBeenCalled();
    expect(fixture.updatePost).not.toHaveBeenCalled();
    expect(fixture.notifier.notifyPostRecalled).not.toHaveBeenCalled();
  });

  for (const targetCount of [0, 1]) {
    test(`keeps the default completion comment when called without a reason (${targetCount} targets)`, async () => {
      const fixture = createFixture({ targetCount, status: "pending_recall" });
      await executePostRecall({ tenantId: "tenant-1", postId: fixture.post.id, actorId: "reviewer-1", logger: fixture.app.log });
      expect(fixture.updatePost).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          logs: { create: expect.objectContaining({ comment: targetCount === 0 ? "没有可撤回的 QZone 发表记录，直接标记为已撤回" : "已撤回 1 个发布目标" }) },
        }),
      }));
    });
  }
});
