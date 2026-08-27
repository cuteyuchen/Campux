import { TransactionIsolationLevel, type Prisma } from "@campux/db";
import { prisma } from "./prisma";
import {
  isTransactionSerializationFailure,
  retryTransactionSerializationFailures,
} from "./tenant-membership-removal";
import { writeAuditLog } from "./audit";

export const botHealthIncidentKinds = ["onebot_connection", "qzone_session"] as const;
export type BotHealthIncidentKind = (typeof botHealthIncidentKinds)[number];

export type BotHealthIncidentRecord = {
  id: string;
  tenantId: string;
  botAccountId: string;
  kind: string;
  startedAt: Date;
  resolvedAt: Date | null;
  reason: string;
  details: Prisma.JsonValue | null;
  faultNotifiedAt: Date | null;
  recoveryNotifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BotHealthClient = typeof prisma;

export async function openBotHealthIncident({
  tenantId,
  botAccountId,
  kind,
  reason,
  details,
  now = new Date(),
}: {
  tenantId: string;
  botAccountId: string;
  kind: BotHealthIncidentKind;
  reason: string;
  details?: unknown;
  now?: Date;
}, client: BotHealthClient = prisma) {
  return retryTransactionSerializationFailures(
    () => client.$transaction(async (tx) => {
      const active = await tx.botHealthIncident.findFirst({
        where: {
          tenantId,
          botAccountId,
          kind,
          resolvedAt: null,
        },
        orderBy: [
          { startedAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      if (active) {
        const updated = await tx.botHealthIncident.update({
          where: { id: active.id },
          data: {
            reason,
            ...(details === undefined ? {} : { details: toJsonValue(details) }),
          },
        });
        return { action: "existing" as const, incident: updated };
      }

      const incident = await tx.botHealthIncident.create({
        data: {
          tenantId,
          botAccountId,
          kind,
          startedAt: now,
          reason,
          ...(details === undefined ? {} : { details: toJsonValue(details) }),
        },
      });
      await writeAuditLog({
        tenantId,
        actorId: null,
        action: kind === "onebot_connection" ? "bot.connection.offline" : "bot.qzone.cookies.invalid",
        targetType: "bot_account",
        targetId: botAccountId,
        detail: {
          incidentId: incident.id,
          kind,
          reason,
          startedAt: incident.startedAt.toISOString(),
          ...(details === undefined ? {} : { details }),
        },
      }, tx);
      return { action: "created" as const, incident };
    }, { isolationLevel: TransactionIsolationLevel.Serializable }),
    isTransactionSerializationFailure,
  );
}

export async function resolveBotHealthIncident({
  tenantId,
  botAccountId,
  kind,
  reason,
  details,
  now = new Date(),
  notifyRecovery = true,
}: {
  tenantId: string;
  botAccountId: string;
  kind: BotHealthIncidentKind;
  reason?: string;
  details?: unknown;
  now?: Date;
  notifyRecovery?: boolean;
}, client: BotHealthClient = prisma) {
  return retryTransactionSerializationFailures(
    () => client.$transaction(async (tx) => {
      const active = await tx.botHealthIncident.findFirst({
        where: {
          tenantId,
          botAccountId,
          kind,
          resolvedAt: null,
        },
        orderBy: [
          { startedAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });
      if (!active) {
        return { resolved: false as const, incident: null };
      }

      const incident = await tx.botHealthIncident.update({
        where: { id: active.id },
        data: {
          resolvedAt: now,
          ...(reason ? { reason } : {}),
          ...(details === undefined ? {} : { details: toJsonValue(details) }),
          ...(notifyRecovery ? {} : { recoveryNotifiedAt: now }),
        },
      });
      if (notifyRecovery) {
        await writeAuditLog({
          tenantId,
          actorId: null,
          action: kind === "onebot_connection" ? "bot.connection.recovered" : "bot.qzone.cookies.recovered",
          targetType: "bot_account",
          targetId: botAccountId,
          detail: {
            incidentId: incident.id,
            kind,
            startedAt: incident.startedAt.toISOString(),
            resolvedAt: now.toISOString(),
            durationMs: Math.max(0, now.getTime() - incident.startedAt.getTime()),
          },
        }, tx);
      }
      return { resolved: true as const, incident };
    }, { isolationLevel: TransactionIsolationLevel.Serializable }),
    isTransactionSerializationFailure,
  );
}

export async function markBotHealthIncidentFaultNotified(incidentId: string, at = new Date(), client: BotHealthClient = prisma) {
  return client.botHealthIncident.update({
    where: { id: incidentId },
    data: { faultNotifiedAt: at },
  });
}

export async function markBotHealthIncidentRecoveryNotified(incidentId: string, at = new Date(), client: BotHealthClient = prisma) {
  return client.botHealthIncident.update({
    where: { id: incidentId },
    data: { recoveryNotifiedAt: at },
  });
}

export async function silentlyResolveBotHealthIncidents({
  botAccountId,
  now = new Date(),
}: {
  botAccountId: string;
  now?: Date;
}, client: BotHealthClient = prisma) {
  const active = await client.botHealthIncident.findMany({
    where: { botAccountId, resolvedAt: null },
    select: { id: true },
  });
  if (active.length === 0) {
    return 0;
  }
  const result = await client.botHealthIncident.updateMany({
    where: { id: { in: active.map((item) => item.id) } },
    data: { resolvedAt: now, recoveryNotifiedAt: now },
  });
  return result.count;
}

export async function listPendingBotHealthNotifications({
  tenantId,
  botAccountId,
}: {
  tenantId?: string;
  botAccountId?: string;
}, client: BotHealthClient = prisma) {
  return client.botHealthIncident.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(botAccountId ? { botAccountId } : {}),
      OR: [
        { resolvedAt: null, faultNotifiedAt: null },
        { resolvedAt: { not: null }, recoveryNotifiedAt: null },
      ],
    },
    orderBy: [
      { startedAt: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export function healthIncidentDurationMs(incident: { startedAt: Date; resolvedAt?: Date | null }, now = new Date()) {
  return Math.max(0, (incident.resolvedAt ?? now).getTime() - incident.startedAt.getTime());
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
