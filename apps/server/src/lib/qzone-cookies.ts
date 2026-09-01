import type { FastifyBaseLogger } from "fastify";
import { prisma } from "./prisma";
import { decryptJson } from "./secret-json";
import { parseQZoneVisitorCounts, qzoneVisitorSnapshotDate } from "./qzone-visitor-stats";
import { tenantRuntimeRelationFilter } from "./tenant-runtime";
import { runWithActiveTenantLease } from "./tenant-runtime-lease";

type QZoneCookieNotifier = {
  notifyQZoneCookiesInvalid?(botAccountId: string, message: string, options?: { autoRefreshError?: string | null }): Promise<void>;
  refreshQZoneCookiesByProtocol?(
    botAccountId: string,
    reason: "heartbeat_invalid" | "publish_login_required" | "publish_preflight_invalid" | "admin_check" | "review_group_refresh",
  ): Promise<{ cookieNames: string[] }>;
  resumeWaitingPublishAttemptsForBot?(botAccountId: string): Promise<number>;
  handleQZoneSessionHealth?(botAccountId: string, status: QZoneCookieHealthStatus, message: string, options?: { source?: string; autoRefreshError?: string | null }): Promise<void>;
};

export const qzoneCookieHealthStatuses = ["unchecked", "available", "invalid"] as const;
export type QZoneCookieHealthStatus = (typeof qzoneCookieHealthStatuses)[number];

const visitorAmountUrl =
  "https://h5.qzone.qq.com/proxy/domain/g.qzone.qq.com/cgi-bin/friendshow/cgi_get_visitor_more?uin={uin}&mask=7&g_tk={gtk}&page=1&fupdate=1&clear=1";
export async function checkQZoneCookieHealth(cookies: Record<string, string>, fallbackUin: string) {
  const pSkey = cookies.p_skey;
  const uin = normalizeQqUin(cookies.uin ?? fallbackUin);
  if (!pSkey) {
    return {
      status: "invalid" as const,
      message: "cookies 缺少 p_skey，无法验证 QZone 登录态",
    };
  }
  if (!uin) {
    return {
      status: "invalid" as const,
      message: "cookies 缺少 uin，无法验证 QZone 登录态",
    };
  }

  try {
    const response = await fetch(visitorAmountUrl.replace("{uin}", uin).replace("{gtk}", generateGtk(pSkey)), {
      headers: {
        Cookie: Object.entries(cookies)
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        Referer: `https://user.qzone.qq.com/${uin}`,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        status: "invalid" as const,
        message: `QZone 检测失败：HTTP ${response.status}`,
      };
    }

    const payload = parseQZoneCallbackJson(text);
    const data = payload?.data;
    const visitorCounts = parseQZoneVisitorCounts(data);
    if (visitorCounts) {
      return {
        status: "available" as const,
        message: `可用，今日访客 ${visitorCounts.todayCount}，总访客 ${visitorCounts.totalCount}`,
        visitorCounts,
      };
    }

    const message = typeof payload?.message === "string" ? payload.message : typeof payload?.msg === "string" ? payload.msg : "QZone 没有返回有效访客数据";
    return {
      status: "invalid" as const,
      message,
    };
  } catch (caught) {
    return {
      status: "invalid" as const,
      message: caught instanceof Error ? caught.message : "QZone cookies 检测失败",
    };
  }
}

export async function checkAndUpdateQZoneSession(sessionId: string) {
  const session = await prisma.botSession.findUnique({
    where: {
      id: sessionId,
    },
    include: {
      botAccount: { include: { tenant: { select: { status: true } } } },
    },
  });
  if (!session || session.botAccount.tenant.status !== "active") {
    return null;
  }

  const leased = await runWithActiveTenantLease(prisma, session.botAccount.tenantId, async (transaction) => {
    let result: Awaited<ReturnType<typeof checkQZoneCookieHealth>>;
    try {
      const cookies = toCookieRecord(decryptJson(session.cookies));
      result = await checkQZoneCookieHealth(cookies, session.botAccount.qqUin.toString());
    } catch (error) {
      result = {
        status: "invalid",
        message: error instanceof Error ? `cookies 解析失败：${error.message}` : "QZone cookies 解析失败",
      };
    }
    const updated = await transaction.botSession.update({
    where: {
      id: session.id,
    },
    data: {
      healthStatus: result.status,
      healthCheckedAt: new Date(),
      healthMessage: result.message,
      healthFailureCount: result.status === "invalid" ? { increment: 1 } : 0,
      ...(result.status === "available" ? { healthInvalidNotifiedAt: null } : {}),
    },
  });

    if (result.status === "available" && result.visitorCounts) {
      await transaction.qZoneVisitorSnapshot.upsert({
      where: {
        botAccountId_date: {
          botAccountId: session.botAccountId,
          date: qzoneVisitorSnapshotDate(updated.healthCheckedAt ?? new Date()),
        },
      },
      create: {
        tenantId: session.botAccount.tenantId,
        botAccountId: session.botAccountId,
        sessionId: session.id,
        date: qzoneVisitorSnapshotDate(updated.healthCheckedAt ?? new Date()),
        todayCount: result.visitorCounts.todayCount,
        totalCount: result.visitorCounts.totalCount,
        checkedAt: updated.healthCheckedAt ?? new Date(),
      },
      update: {
        sessionId: session.id,
        todayCount: result.visitorCounts.todayCount,
        totalCount: result.visitorCounts.totalCount,
        checkedAt: updated.healthCheckedAt ?? new Date(),
      },
      });
    }
    return updated;
  });
  return leased.active ? leased.value : null;
}

/**
 * 发布接口直接返回登录失效时没有新的健康检查结果，仍要把当前会话
 * 标成不可用，避免后续预检继续复用旧的 available 状态。
 */
export async function markQZoneSessionInvalidForBot(botAccountId: string, message: string) {
  const session = await prisma.botSession.findFirst({
    where: {
      botAccountId,
      type: "qzone",
      domain: "user.qzone.qq.com",
    },
    orderBy: { refreshedAt: "desc" },
    select: {
      id: true,
      healthStatus: true,
    },
  });
  if (!session) {
    return null;
  }

  return prisma.botSession.update({
    where: { id: session.id },
    data: {
      healthStatus: "invalid",
      healthCheckedAt: new Date(),
      healthMessage: message,
      ...(session.healthStatus === "invalid" ? {} : { healthFailureCount: { increment: 1 } }),
    },
  });
}

/**
 * 统一处理一次 QZone 登录态检测结果。所有主动检测入口都应调用此函数，
 * 这样“首次失效、自动刷新、故障去重、恢复通知”不会因入口不同而出现不同步。
 */
export async function evaluateQZoneSessionHealth(
  sessionId: string,
  notifier?: QZoneCookieNotifier,
  reason: "heartbeat_invalid" | "publish_login_required" | "publish_preflight_invalid" | "admin_check" | "review_group_refresh" = "heartbeat_invalid",
) {
  const updated = await checkAndUpdateQZoneSession(sessionId);
  if (!updated) {
    return null;
  }
  if (updated.healthStatus === "available") {
    await notifier?.handleQZoneSessionHealth?.(updated.botAccountId, "available", updated.healthMessage ?? "QZone 登录态已恢复", { source: reason });
    await notifier?.resumeWaitingPublishAttemptsForBot?.(updated.botAccountId);
    return updated;
  }

  const refreshTarget = await prisma.publishTarget.findFirst({
    where: {
      botAccountId: updated.botAccountId,
      enabled: true,
      qzoneRefreshMode: "protocol",
    },
    select: { id: true },
  });
  let autoRefreshError: string | null = null;
  // A single invalid transition gets one automatic protocol refresh attempt.
  // Repeated checks keep the incident reason current without repeatedly
  // invoking the protocol endpoint (publishing can still explicitly retry).
  const shouldAttemptAutoRefresh = updated.healthFailureCount === undefined || updated.healthFailureCount <= 1;
  if (shouldAttemptAutoRefresh && refreshTarget && notifier?.refreshQZoneCookiesByProtocol) {
    try {
      await notifier.refreshQZoneCookiesByProtocol(updated.botAccountId, reason);
      const refreshed = await prisma.botSession.findUnique({ where: { id: updated.id } });
      if (refreshed?.healthStatus === "available") {
        await notifier.handleQZoneSessionHealth?.(updated.botAccountId, "available", refreshed.healthMessage ?? "QZone 登录态已恢复", { source: reason });
        await notifier.resumeWaitingPublishAttemptsForBot?.(updated.botAccountId);
        return refreshed;
      }
      autoRefreshError = refreshed?.healthMessage ? `协议自动刷新后 cookies 仍不可用：${refreshed.healthMessage}` : "协议自动刷新后没有拿到可用 cookies";
    } catch (error) {
      autoRefreshError = toErrorMessage(error);
    }
  } else if (shouldAttemptAutoRefresh && !refreshTarget) {
    autoRefreshError = "未配置协议自动刷新";
  } else if (shouldAttemptAutoRefresh && refreshTarget && !notifier?.refreshQZoneCookiesByProtocol) {
    autoRefreshError = "协议自动刷新不可用";
  }

  await notifier?.handleQZoneSessionHealth?.(updated.botAccountId, "invalid", updated.healthMessage ?? "QZone cookies 检测失败", {
    source: reason,
    autoRefreshError,
  });
  if (notifier && !notifier.handleQZoneSessionHealth && notifier.notifyQZoneCookiesInvalid && !updated.healthInvalidNotifiedAt) {
    await notifier.notifyQZoneCookiesInvalid(updated.botAccountId, updated.healthMessage ?? "QZone cookies 检测失败", { autoRefreshError });
    await prisma.botSession.update({
      where: { id: updated.id },
      data: { healthInvalidNotifiedAt: new Date() },
    });
  }
  return updated;
}

export function registerQZoneCookieHeartbeat(logger: FastifyBaseLogger, notifier?: QZoneCookieNotifier) {
  async function run() {
    const sessions = await prisma.botSession.findMany({
      where: {
        type: "qzone",
        botAccount: {
          enabled: true,
          platform: "onebot",
          tenant: tenantRuntimeRelationFilter,
        },
      },
      select: {
        id: true,
        botAccountId: true,
      },
    });

    for (const session of sessions) {
      try {
        await evaluateQZoneSessionHealth(session.id, notifier, "heartbeat_invalid");
      } catch (error) {
        logger.warn({ error, sessionId: session.id }, "qzone cookie heartbeat failed");
      }
    }
  }

  const timer = setInterval(() => {
    void run().catch((error) => logger.warn({ error }, "qzone cookie heartbeat failed"));
  }, 60_000);
  void run().catch((error) => logger.warn({ error }, "qzone cookie heartbeat failed"));
  return () => clearInterval(timer);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "协议自动刷新失败";
}

export function generateGtk(skey: string) {
  let value = 5381;
  for (let index = 0; index < skey.length; index += 1) {
    value += (value << 5) + skey.charCodeAt(index);
  }
  return String(value & 2147483647);
}

function parseQZoneCallbackJson(text: string) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("_Callback(") ? trimmed.replace(/^_Callback\(/, "").replace(/\);?$/, "") : trimmed;
  try {
    return JSON.parse(jsonText) as { data?: unknown; message?: unknown; msg?: unknown };
  } catch {
    return null;
  }
}

function normalizeQqUin(value: string) {
  const matched = value.match(/\d+/);
  return matched ? matched[0] : "";
}

function toCookieRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, cookieValue]) => (typeof cookieValue === "string" ? [[name, cookieValue]] : [])),
  );
}
