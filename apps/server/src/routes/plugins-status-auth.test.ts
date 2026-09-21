import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { createPluginRegistry } from "@campux/plugin";
import type { CampuxPlugin } from "@campux/plugin";
import { registerPluginRoutes } from "./plugins";

const source = readFileSync(new URL("./plugins.ts", import.meta.url), "utf8");

function createTestPlugin(overrides: Partial<CampuxPlugin> = {}): CampuxPlugin {
  return {
    name: "campux-plugin-content-moderation",
    version: "1.0.0",
    enabledByDefault: true,
    ...overrides,
  };
}

describe("global plugin status permission boundary", () => {
  test("PATCH global plugin status uses requireSystemOperator by default", () => {
    const patchHandler = source.slice(
      source.indexOf('app.patch("/api/admin/plugins/:name/status"'),
      source.indexOf("// 获取插件事件日志"),
    );
    expect(patchHandler).toContain("auth.requireSystemOperator(request, reply)");
    expect(source).toContain("requireSystemOperator");
    expect(patchHandler).not.toContain('requireReadyTenant(request, reply, "admin")');
  });

  test("read-only plugin APIs still allow tenant admin", () => {
    const listHandler = source.slice(
      source.indexOf('app.get("/api/admin/plugins"'),
      source.indexOf('app.patch("/api/admin/plugins/:name/status"'),
    );
    expect(listHandler).toContain('auth.requireReadyTenant(request, reply, "admin")');
  });

  test("tenant admin cannot mutate global status; system_operator can", async () => {
    const app = Fastify({ logger: false });
    const registry = createPluginRegistry(
      app as never,
      {} as never,
      {} as never,
      { registerWorker: () => undefined } as never,
    );
    registry.register(createTestPlugin());

    type SessionMode = "system_operator" | "tenant_admin";
    let sessionMode: SessionMode = "system_operator";

    registerPluginRoutes(app, registry, {
      requireReadyTenant: async (_request, _reply, role) =>
        ({ user: { systemRole: null }, selectedMembership: { role } }) as never,
      requireSystemOperator: async (_request, reply) => {
        if (sessionMode !== "system_operator") {
          reply.code(403);
          const error = new Error("没有系统运维权限") as Error & { statusCode: number };
          error.statusCode = 403;
          throw error;
        }
        return { user: { systemRole: "system_operator" } } as never;
      },
    });
    app.setErrorHandler((error, _request, reply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      reply.status(statusCode >= 400 ? statusCode : 500).send({ message: (error as Error).message });
    });

    try {
      sessionMode = "system_operator";
      const allowed = await app.inject({
        method: "PATCH",
        url: "/api/admin/plugins/campux-plugin-content-moderation/status",
        payload: { status: "disabled" },
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toMatchObject({ ok: true, status: "disabled", scope: "global" });
      expect(registry.getStatus("campux-plugin-content-moderation")).toBe("disabled");

      sessionMode = "tenant_admin";
      const forbidden = await app.inject({
        method: "PATCH",
        url: "/api/admin/plugins/campux-plugin-content-moderation/status",
        payload: { status: "enabled" },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(registry.getStatus("campux-plugin-content-moderation")).toBe("disabled");

      const list = await app.inject({ method: "GET", url: "/api/admin/plugins" });
      expect(list.statusCode).toBe(200);
      expect(list.json().plugins[0]).toMatchObject({ status: "disabled" });
    } finally {
      await app.close();
    }
  });

  test("tenant moderation settings stay on tenant admin APIs", () => {
    const metadataSource = readFileSync(new URL("./metadata.ts", import.meta.url), "utf8");
    expect(metadataSource).toContain('requireTenantRole(request, reply, "admin")');
    expect(metadataSource).toContain("blockedWords");
    expect(metadataSource).toContain("ocrBlockedWordsEnabled");
    expect(metadataSource).not.toContain("requireSystemOperator");
  });
});
