import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import type { RuntimeQueue } from "../runtime/queue";

export function registerHealthRoutes(
  app: FastifyInstance,
  queue: RuntimeQueue,
  checkDatabase: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
) {
  let pendingDatabaseCheck: Promise<unknown> | undefined;

  app.get("/api/health", async (_request, reply) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Share a slow probe so concurrent health checks cannot fill the pool.
      pendingDatabaseCheck ??= Promise.resolve().then(checkDatabase).finally(() => {
        pendingDatabaseCheck = undefined;
      });
      await Promise.race([
        pendingDatabaseCheck,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("database health check timed out")), 2_000);
        }),
      ]);
      return { ok: true, service: "campux-next", database: "ok", queue: queue.snapshot() };
    } catch {
      return reply.code(503).send({
        ok: false,
        service: "campux-next",
        database: "unavailable",
        queue: queue.snapshot(),
      });
    } finally {
      clearTimeout(timer);
    }
  });
}
