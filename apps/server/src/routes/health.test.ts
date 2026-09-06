import { describe, expect, test } from "bun:test";
import Fastify from "fastify";
import { registerHealthRoutes } from "./health";
import type { RuntimeQueue } from "../runtime/queue";

const queue = { snapshot: () => ({ running: true, queued: 0 }) } as RuntimeQueue;

describe("database-aware health check", () => {
  test("reports healthy only after a database query succeeds", async () => {
    const app = Fastify();
    let checked = false;
    registerHealthRoutes(app, queue, async () => { checked = true; });
    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });
      expect(checked).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, database: "ok" });
    } finally {
      await app.close();
    }
  });

  test("returns 503 without exposing database errors and recovers on the next probe", async () => {
    const app = Fastify();
    let failed = true;
    registerHealthRoutes(app, queue, async () => {
      if (failed) throw new Error("private connection details");
    });
    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ ok: false, database: "unavailable" });
      expect(response.body).not.toContain("private");
      failed = false;
      expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test("bounds blocked probes and shares the outstanding query across requests", async () => {
    const app = Fastify();
    let queries = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    registerHealthRoutes(app, queue, () => {
      queries += 1;
      return blocked;
    });
    try {
      const responses = await Promise.all([
        app.inject({ method: "GET", url: "/api/health" }),
        app.inject({ method: "GET", url: "/api/health" }),
      ]);
      expect(responses.map((response) => response.statusCode)).toEqual([503, 503]);
      expect(queries).toBe(1);
      release();
      expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
      expect(queries).toBe(2);
    } finally {
      release();
      await app.close();
    }
  });
});
