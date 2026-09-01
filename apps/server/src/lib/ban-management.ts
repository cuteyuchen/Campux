import { TransactionIsolationLevel, type Prisma } from "@campux/db";
import { writeAuditLog } from "./audit";
import {
  isTransactionSerializationFailure,
  retryTransactionSerializationFailures,
  TransactionSerializationRetriesExhaustedError,
} from "./tenant-membership-removal";
import { prisma } from "./prisma";

export const AUTO_BAN_DURATION_MS = 24 * 60 * 60 * 1000;

export type BanOperationSource = "admin_web" | "review_group" | "auto_security";
export type BanAction = "created" | "updated";

export class BanTargetNotMemberError extends Error {
  constructor() {
    super("该用户不属于当前校园墙");
    this.name = "BanTargetNotMemberError";
  }
}

export class BanTargetAdminError extends Error {
  constructor() {
    super("不能封禁管理员");
    this.name = "BanTargetAdminError";
  }
}

export class BanEndsAtInvalidError extends Error {
  constructor() {
    super("封禁结束时间必须晚于当前时间");
    this.name = "BanEndsAtInvalidError";
  }
}

type BanRecord = {
  id: string;
  tenantId: string;
  userId: string;
  operatorId: string | null;
  comment: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

export type BanManagementClient = typeof prisma | Prisma.TransactionClient;

export type UpsertBanResult = {
  action: BanAction;
  ban: BanRecord;
  affectedRecordIds: string[];
  previous: Array<{
    id: string;
    comment: string;
    startsAt: string;
    endsAt: string;
    operatorId: string | null;
  }>;
};

export type EndActiveBansResult = {
  ended: boolean;
  ban: BanRecord | null;
  endedRecordIds: string[];
};

function runBanTransaction<Result>(
  client: BanManagementClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
) {
  if ("$transaction" in client) {
    return client.$transaction(operation, { isolationLevel: TransactionIsolationLevel.Serializable });
  }
  return operation(client);
}

export async function upsertBanRecord({
  tenantId,
  userId,
  operatorId,
  comment,
  endsAt,
  source,
  now = new Date(),
}: {
  tenantId: string;
  userId: string;
  operatorId?: string | null;
  comment: string;
  endsAt: Date;
  source: BanOperationSource;
  now?: Date;
}, client: BanManagementClient = prisma): Promise<UpsertBanResult> {
  const endsAtMs = endsAt.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(endsAtMs) || !Number.isFinite(nowMs) || endsAtMs <= nowMs) {
    throw new BanEndsAtInvalidError();
  }

  return retryTransactionSerializationFailures(
    () => runBanTransaction(client, async (tx) => {
      const membership = await tx.tenantMembership.findUnique({
        where: {
          tenantId_userId: {
            tenantId,
            userId,
          },
        },
        select: {
          role: true,
        },
      });

      if (!membership) {
        throw new BanTargetNotMemberError();
      }
      if (membership.role === "admin") {
        throw new BanTargetAdminError();
      }

      const activeBans = await tx.banRecord.findMany({
        where: {
          tenantId,
          userId,
          endsAt: {
            gt: now,
          },
        },
        orderBy: [
          { startsAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      if (activeBans.length === 0) {
        const ban = await tx.banRecord.create({
          data: {
            tenantId,
            userId,
            operatorId: operatorId ?? null,
            comment,
            endsAt,
          },
        });

        await writeAuditLog({
          tenantId,
          actorId: operatorId ?? null,
          action: "ban.create",
          targetType: "user",
          targetId: userId,
          detail: {
            comment,
            endsAt: endsAt.toISOString(),
            source,
          },
        }, tx);

        return {
          action: "created" as const,
          ban,
          affectedRecordIds: [ban.id],
          previous: [],
        };
      }

      const previous = activeBans.map((ban) => ({
        id: ban.id,
        comment: ban.comment,
        startsAt: ban.startsAt.toISOString(),
        endsAt: ban.endsAt.toISOString(),
        operatorId: ban.operatorId,
      }));
      const affectedRecordIds = activeBans.map((ban) => ban.id);
      const next = {
        comment,
        endsAt: endsAt.toISOString(),
        operatorId: operatorId ?? null,
      };

      await tx.banRecord.updateMany({
        where: {
          id: {
            in: affectedRecordIds,
          },
        },
        data: {
          comment,
          endsAt,
          operatorId: operatorId ?? null,
        },
      });

      const ban = await tx.banRecord.findUnique({
        where: {
          id: activeBans[0]!.id,
        },
      });
      if (!ban) {
        throw new Error("更新封禁记录后无法读取记录");
      }

      await writeAuditLog({
        tenantId,
        actorId: operatorId ?? null,
        action: "ban.update",
        targetType: "user",
        targetId: userId,
        detail: {
          source,
          recordIds: affectedRecordIds,
          old: previous,
          new: next,
          previous,
          next,
        },
      }, tx);

      return {
        action: "updated" as const,
        ban,
        affectedRecordIds,
        previous,
      };
    }),
    isTransactionSerializationFailure,
  );
}

export async function endActiveBanRecords({
  tenantId,
  userId,
  operatorId,
  source,
  endedAt = new Date(),
  now = endedAt,
}: {
  tenantId: string;
  userId: string;
  operatorId?: string | null;
  source: BanOperationSource;
  endedAt?: Date;
  now?: Date;
}, client: BanManagementClient = prisma): Promise<EndActiveBansResult> {
  return retryTransactionSerializationFailures(
    () => runBanTransaction(client, async (tx) => {
      const activeBans = await tx.banRecord.findMany({
        where: {
          tenantId,
          userId,
          endsAt: {
            gt: now,
          },
        },
        orderBy: [
          { startsAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
      });

      if (activeBans.length === 0) {
        return {
          ended: false,
          ban: null,
          endedRecordIds: [],
        };
      }

      const endedRecordIds = activeBans.map((ban) => ban.id);
      await tx.banRecord.updateMany({
        where: {
          id: {
            in: endedRecordIds,
          },
        },
        data: {
          endsAt: endedAt,
        },
      });

      const ban = await tx.banRecord.findUnique({
        where: {
          id: activeBans[0]!.id,
        },
      });

      await writeAuditLog({
        tenantId,
        actorId: operatorId ?? null,
        action: "ban.unban",
        targetType: "user",
        targetId: userId,
        detail: {
          source,
          recordIds: endedRecordIds,
          endedAt: endedAt.toISOString(),
        },
      }, tx);

      return {
        ended: true,
        ban,
        endedRecordIds,
      };
    }),
    isTransactionSerializationFailure,
  );
}

export type AutoBanResult = {
  endsAt: Date;
  tenantIds: string[];
  createdTenantIds: string[];
  updatedTenantIds: string[];
  results: Array<UpsertBanResult & { tenantId: string }>;
};

/**
 * 对用户加入的所有校园墙逐一执行自动封禁，只有出现新建记录时才触发通知回调。
 */
export async function createAutoBan({
  tenantId,
  userId,
  operatorId,
  reason,
  onBan,
}: {
  tenantId: string;
  userId: string;
  operatorId?: string;
  reason: string;
  onBan?: (userId: string, tenantIds: string[], endsAt: Date, result: AutoBanResult) => Promise<void>;
}, client: BanManagementClient = prisma): Promise<AutoBanResult> {
  const endsAt = new Date(Date.now() + AUTO_BAN_DURATION_MS);
  const memberships = await client.tenantMembership.findMany({
    where: {
      userId,
    },
    select: {
      tenantId: true,
    },
  });
  const tenantIds = [...new Set([tenantId, ...memberships.map((membership) => membership.tenantId)])];
  const results: AutoBanResult["results"] = [];

  for (const currentTenantId of tenantIds) {
    const result = await upsertBanRecord({
      tenantId: currentTenantId,
      userId,
      operatorId: operatorId ?? null,
      comment: `自动封禁（24小时）：${reason}`,
      endsAt,
      source: "auto_security",
    }, client);
    results.push({
      tenantId: currentTenantId,
      ...result,
    });
  }

  const autoBanResult: AutoBanResult = {
    endsAt,
    tenantIds,
    createdTenantIds: results.filter((result) => result.action === "created").map((result) => result.tenantId),
    updatedTenantIds: results.filter((result) => result.action === "updated").map((result) => result.tenantId),
    results,
  };

  if (onBan && autoBanResult.createdTenantIds.length > 0) {
    await onBan(userId, tenantIds, endsAt, autoBanResult).catch(() => undefined);
  }

  return autoBanResult;
}

export function banManagementErrorResponse(error: unknown) {
  if (error instanceof BanTargetNotMemberError) {
    return { statusCode: 404 as const, message: error.message };
  }
  if (error instanceof BanTargetAdminError) {
    return { statusCode: 409 as const, message: error.message };
  }
  if (error instanceof BanEndsAtInvalidError) {
    return { statusCode: 400 as const, message: error.message };
  }
  if (error instanceof TransactionSerializationRetriesExhaustedError) {
    return { statusCode: 409 as const, message: "封禁记录正在被其他操作更新，请刷新后重试" };
  }
  return null;
}

export type BanTransactionClient = Prisma.TransactionClient;
