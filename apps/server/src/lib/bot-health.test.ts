import { describe, expect, test } from "bun:test";
import {
  healthIncidentDurationMs,
  openBotHealthIncident,
  resolveBotHealthIncident,
  silentlyResolveBotHealthIncidents,
} from "./bot-health";

function fakeClient(initial: any[] = []) {
  const incidents = [...initial];
  const audits: any[] = [];
  let nextId = 1;
  const tx: any = {
    botHealthIncident: {
      findFirst: async ({ where }: any) => incidents.find((item) => item.tenantId === where.tenantId && item.botAccountId === where.botAccountId && item.kind === where.kind && (where.resolvedAt === null ? item.resolvedAt === null : true)) ?? null,
      findMany: async ({ where }: any) => incidents.filter((item) => item.botAccountId === where.botAccountId && item.resolvedAt === null).map((item) => ({ id: item.id })),
      create: async ({ data }: any) => {
        const now = data.startedAt ?? new Date();
        const record = { ...data, id: `incident-${nextId++}`, resolvedAt: null, details: data.details ?? null, faultNotifiedAt: null, recoveryNotifiedAt: null, createdAt: now, updatedAt: now };
        incidents.push(record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const record = incidents.find((item) => item.id === where.id);
        Object.assign(record, data);
        return record;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const record of incidents) {
          if (!where.id.in.includes(record.id)) continue;
          Object.assign(record, data);
          count += 1;
        }
        return { count };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
  };
  const client: any = {
    ...tx,
    $transaction: async (callback: any) => callback(tx),
  };
  return { client, incidents, audits };
}

describe("bot health incidents", () => {
  test("opens one active incident and updates its reason on repeated failures", async () => {
    const fake = fakeClient();
    const startedAt = new Date("2026-08-27T00:00:00.000Z");
    const first = await openBotHealthIncident({
      tenantId: "tenant",
      botAccountId: "bot",
      kind: "onebot_connection",
      reason: "断开",
      now: startedAt,
    }, fake.client);
    const second = await openBotHealthIncident({
      tenantId: "tenant",
      botAccountId: "bot",
      kind: "onebot_connection",
      reason: "心跳超时",
      now: new Date(startedAt.getTime() + 60_000),
    }, fake.client);
    expect(first.action).toBe("created");
    expect(second.action).toBe("existing");
    expect(fake.incidents).toHaveLength(1);
    expect(fake.incidents[0].reason).toBe("心跳超时");
    expect(fake.audits.map((item) => item.action)).toEqual(["bot.connection.offline"]);
  });

  test("resolves once and can silently close all active incidents", async () => {
    const fake = fakeClient();
    const startedAt = new Date("2026-08-27T00:00:00.000Z");
    await openBotHealthIncident({ tenantId: "tenant", botAccountId: "bot", kind: "qzone_session", reason: "失效", now: startedAt }, fake.client);
    const resolved = await resolveBotHealthIncident({ tenantId: "tenant", botAccountId: "bot", kind: "qzone_session", now: new Date(startedAt.getTime() + 90_000) }, fake.client);
    expect(resolved.resolved).toBe(true);
    expect(healthIncidentDurationMs(resolved.incident!, new Date(startedAt.getTime() + 120_000))).toBe(90_000);
    expect(fake.audits.map((item) => item.action)).toEqual(["bot.qzone.cookies.invalid", "bot.qzone.cookies.recovered"]);
    expect(await silentlyResolveBotHealthIncidents({ botAccountId: "bot" }, fake.client)).toBe(0);
  });
});
