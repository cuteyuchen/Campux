import type { FastifyInstance } from "fastify";
import type { PluginRegistry } from "@campux/plugin";
import { requireReadyTenant, requireSystemOperator } from "../lib/auth";
import { z } from "zod";

const pluginStatusSchema = z.object({
  status: z.enum(["enabled", "disabled"]),
});

const eventLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

type AuthGates = {
  requireReadyTenant: typeof requireReadyTenant;
  requireSystemOperator: typeof requireSystemOperator;
};

/**
 * 插件管理路由。
 * 只读接口供校园墙 admin 查看；全局 runtime status 修改仅限 system_operator，
 * 因为 PluginRegistry status 影响当前进程所有 tenant（含投稿前审核）。
 */
export function registerPluginRoutes(
  app: FastifyInstance,
  pluginRegistry: PluginRegistry,
  auth: AuthGates = { requireReadyTenant, requireSystemOperator },
) {
  // 获取所有已注册插件的信息
  app.get("/api/admin/plugins", async (request, reply) => {
    await auth.requireReadyTenant(request, reply, "admin");

    const statuses = pluginRegistry.listStatuses();
    const plugins = pluginRegistry.list().map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      description: plugin.description ?? null,
      campuxVersion: plugin.campuxVersion ?? null,
      hasInit: !!plugin.hooks?.onInit,
      hasReady: !!plugin.hooks?.onReady,
      hasClose: !!plugin.hooks?.onClose,
      status: statuses.get(plugin.name) ?? "enabled",
    }));

    return { plugins };
  });

  // 设置插件全局启用/禁用状态（进程内，影响所有 tenant）
  app.patch("/api/admin/plugins/:name/status", async (request, reply) => {
    await auth.requireSystemOperator(request, reply);
    const params = z.object({ name: z.string().min(1) }).parse(request.params);
    const body = pluginStatusSchema.parse(request.body);

    const plugin = pluginRegistry.get(params.name);
    if (!plugin) {
      return reply.code(404).send({ message: "插件不存在" });
    }

    pluginRegistry.setStatus(params.name, body.status);
    app.log.info(`[PluginRoutes] plugin "${params.name}" global status set to "${body.status}" by system_operator`);

    return {
      ok: true,
      name: params.name,
      status: body.status,
      scope: "global",
    };
  });

  // 获取插件事件日志
  app.get("/api/admin/plugins/events", async (request, reply) => {
    await auth.requireReadyTenant(request, reply, "admin");
    const query = eventLogQuerySchema.parse(request.query);

    const events = pluginRegistry.getEventBus().getRecentEvents(query.limit);

    return {
      events: events.map((entry) => ({
        timestamp: new Date(entry.timestamp).toISOString(),
        type: entry.event.type,
        ...Object.fromEntries(
          Object.entries(entry.event).filter(([key]) => key !== "type")
        ),
      })),
    };
  });

  // 获取插件权限声明
  app.get("/api/admin/plugins/permissions", async (request, reply) => {
    await auth.requireReadyTenant(request, reply, "admin");

    const permissions = pluginRegistry.listPermissions();

    return {
      permissions: permissions.map((p) => ({
        name: p.name,
        required: p.permissions?.required ?? [],
        riskLevel: p.permissions?.riskLevel ?? "unknown",
        rationale: p.permissions?.rationale ?? null,
      })),
    };
  });

  // 获取插件审计日志
  app.get("/api/admin/plugins/audit", async (request, reply) => {
    await auth.requireReadyTenant(request, reply, "admin");
    const query = auditLogQuerySchema.parse(request.query);

    const auditLog = pluginRegistry.getAuditLog(query.limit);

    return {
      auditLog: auditLog.map((entry) => ({
        id: `${entry.timestamp}-${entry.pluginName}`,
        timestamp: new Date(entry.timestamp).toISOString(),
        action: entry.action,
        pluginName: entry.pluginName,
        operator: entry.operator ?? null,
        detail: entry.detail ?? null,
        metadata: entry.metadata ?? null,
      })),
    };
  });
}
