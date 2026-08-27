import { describe, expect, test } from "bun:test";
import {
  BanEndsAtInvalidError,
  BanTargetAdminError,
  type BanManagementClient,
  createAutoBan,
  endActiveBanRecords,
  upsertBanRecord,
} from "./ban-management";

type FakeBan = {
  id: string;
  tenantId: string;
  userId: string;
  operatorId: string | null;
  comment: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

function fakeClient({
  memberships,
  bans = [],
}: {
  memberships: Array<{ tenantId: string; userId: string; role: "submitter" | "reviewer" | "admin" }>;
  bans?: FakeBan[];
}) {
  const records = [...bans];
  const audits: Array<{ action: string; detail: unknown }> = [];
  let nextId = 1;

  const tx = {
    tenantMembership: {
      findUnique: async ({ where }: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => memberships.find(
        (membership) => membership.tenantId === where.tenantId_userId.tenantId && membership.userId === where.tenantId_userId.userId,
      ) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) => memberships.filter((membership) => membership.userId === where.userId),
    },
    banRecord: {
      findMany: async ({ where }: { where: { tenantId: string; userId: string; endsAt: { gt: Date } } }) => records
        .filter((record) => record.tenantId === where.tenantId && record.userId === where.userId && record.endsAt > where.endsAt.gt)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
      create: async ({ data }: { data: Omit<FakeBan, "id" | "startsAt" | "createdAt"> }) => {
        const now = new Date();
        const record: FakeBan = { ...data, id: `ban-${nextId++}`, startsAt: now, createdAt: now };
        records.push(record);
        return record;
      },
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<FakeBan> }) => {
        let count = 0;
        for (const record of records) {
          if (!where.id.in.includes(record.id)) continue;
          Object.assign(record, data);
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: { where: { id: string } }) => records.find((record) => record.id === where.id) ?? null,
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; detail: unknown } }) => {
        audits.push({ action: data.action, detail: data.detail });
        return data;
      },
    },
  };

  const client = {
    ...tx,
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  } as unknown as BanManagementClient;

  return { client, records, audits };
}

function activeBan(overrides: Partial<FakeBan> = {}): FakeBan {
  const startsAt = new Date("2026-08-20T00:00:00.000Z");
  return {
    id: "ban-existing",
    tenantId: "tenant-a",
    userId: "user-a",
    operatorId: "operator-old",
    comment: "旧原因",
    startsAt,
    endsAt: new Date("2026-09-01T00:00:00.000Z"),
    createdAt: startsAt,
    ...overrides,
  };
}

describe("upsertBanRecord", () => {
  test("rejects an invalid or past end time", async () => {
    const fake = fakeClient({ memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "submitter" }] });
    await expect(upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      comment: "无效时间",
      endsAt: new Date("invalid"),
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client)).rejects.toBeInstanceOf(BanEndsAtInvalidError);
    expect(fake.records).toHaveLength(0);
  });

  test("creates a record when there is no active ban", async () => {
    const fake = fakeClient({ memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "submitter" }] });
    const result = await upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      operatorId: "operator-a",
      comment: "刷屏",
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client);

    expect(result.action).toBe("created");
    expect(fake.records).toHaveLength(1);
    expect(fake.audits[0]?.action).toBe("ban.create");
  });

  test("updates an active record without creating another one", async () => {
    const existing = activeBan();
    const fake = fakeClient({
      memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "reviewer" }],
      bans: [existing],
    });
    const result = await upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      operatorId: "operator-new",
      comment: "改为长期封禁",
      endsAt: new Date("2026-10-01T00:00:00.000Z"),
      source: "review_group",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client);

    expect(result.action).toBe("updated");
    expect(fake.records).toHaveLength(1);
    expect(fake.records[0]?.id).toBe(existing.id);
    expect(fake.records[0]?.startsAt).toEqual(existing.startsAt);
    expect(fake.records[0]?.comment).toBe("改为长期封禁");
    expect(fake.records[0]?.operatorId).toBe("operator-new");
    expect(fake.audits[0]?.action).toBe("ban.update");
  });

  test("synchronizes every currently active duplicate on update", async () => {
    const fake = fakeClient({
      memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "submitter" }],
      bans: [
        activeBan(),
        activeBan({ id: "ban-duplicate", startsAt: new Date("2026-08-21T00:00:00.000Z") }),
      ],
    });
    const endsAt = new Date("2026-09-03T00:00:00.000Z");
    const result = await upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      operatorId: "operator-new",
      comment: "同步理由",
      endsAt,
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client);

    expect(result.action).toBe("updated");
    expect(fake.records).toHaveLength(2);
    expect(fake.records.every((record) => record.comment === "同步理由" && record.endsAt === endsAt && record.operatorId === "operator-new")).toBe(true);
  });

  test("creates a new record when previous bans have already ended", async () => {
    const fake = fakeClient({
      memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "submitter" }],
      bans: [activeBan({ endsAt: new Date("2026-08-26T00:00:00.000Z") })],
    });
    const result = await upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      comment: "再次封禁",
      endsAt: new Date("2026-09-02T00:00:00.000Z"),
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client);

    expect(result.action).toBe("created");
    expect(fake.records).toHaveLength(2);
    expect(fake.records[0]?.comment).toBe("旧原因");
    expect(fake.records[1]?.comment).toBe("再次封禁");
  });

  test("rejects an administrator target", async () => {
    const fake = fakeClient({ memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "admin" }] });
    await expect(upsertBanRecord({
      tenantId: "tenant-a",
      userId: "user-a",
      comment: "不应成功",
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
    }, fake.client)).rejects.toBeInstanceOf(BanTargetAdminError);
    expect(fake.records).toHaveLength(0);
  });
});

describe("endActiveBanRecords", () => {
  test("updates every active duplicate and ends them together", async () => {
    const first = activeBan();
    const second = activeBan({ id: "ban-duplicate", startsAt: new Date("2026-08-21T00:00:00.000Z") });
    const fake = fakeClient({
      memberships: [{ tenantId: "tenant-a", userId: "user-a", role: "submitter" }],
      bans: [first, second],
    });
    const endedAt = new Date("2026-08-27T12:00:00.000Z");
    const result = await endActiveBanRecords({
      tenantId: "tenant-a",
      userId: "user-a",
      operatorId: "operator-a",
      source: "admin_web",
      now: new Date("2026-08-27T00:00:00.000Z"),
      endedAt,
    }, fake.client);

    expect(result.ended).toBe(true);
    expect(result.endedRecordIds).toEqual(["ban-existing", "ban-duplicate"]);
    expect(fake.records.every((record) => record.endsAt === endedAt)).toBe(true);
    expect(fake.audits[0]?.action).toBe("ban.unban");
  });
});

describe("createAutoBan", () => {
  test("notifies once when at least one tenant gets a new record", async () => {
    const fake = fakeClient({
      memberships: [
        { tenantId: "tenant-a", userId: "user-a", role: "submitter" },
        { tenantId: "tenant-b", userId: "user-a", role: "submitter" },
      ],
      bans: [activeBan({ tenantId: "tenant-a" })],
    });
    let callbackCount = 0;
    const result = await createAutoBan({
      tenantId: "tenant-a",
      userId: "user-a",
      operatorId: "operator-a",
      reason: "注入内容",
      onBan: async () => {
        callbackCount += 1;
      },
    }, fake.client);

    expect(result.createdTenantIds).toEqual(["tenant-b"]);
    expect(result.updatedTenantIds).toEqual(["tenant-a"]);
    expect(callbackCount).toBe(1);
    expect(fake.audits.map((audit) => audit.action)).toEqual(["ban.update", "ban.create"]);
  });

  test("does not notify when every tenant only updates an active record", async () => {
    const fake = fakeClient({
      memberships: [
        { tenantId: "tenant-a", userId: "user-a", role: "submitter" },
        { tenantId: "tenant-b", userId: "user-a", role: "submitter" },
      ],
      bans: [
        activeBan({ tenantId: "tenant-a" }),
        activeBan({ id: "ban-b", tenantId: "tenant-b" }),
      ],
    });
    let callbackCount = 0;
    const result = await createAutoBan({
      tenantId: "tenant-a",
      userId: "user-a",
      reason: "再次检测",
      onBan: async () => {
        callbackCount += 1;
      },
    }, fake.client);

    expect(result.createdTenantIds).toEqual([]);
    expect(result.updatedTenantIds).toEqual(["tenant-a", "tenant-b"]);
    expect(callbackCount).toBe(0);
  });
});
