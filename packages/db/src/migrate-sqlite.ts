import { createHash, randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

/**
 * SQLite 自包含迁移器。
 *
 * 单文件 / 自托管 SQLite 形态以派生 baseline 建库，并在每次启动时继续执行本文件登记的
 * 增量迁移。baseline 由 scripts/generate-sqlite-schema.ts 生成并在编译期内嵌。
 *
 * 记账：沿用与 Prisma 兼容的 `_prisma_migrations` 表，把 baseline 记作一条名为
 * `0_sqlite_baseline` 的迁移（checksum = sha256(baselineSql)）。重复启动时按 name 跳过，
 * 实现幂等。这样即便将来引入「sqlite 增量迁移目录」，也能与本 baseline 记账无缝衔接。
 *
 * 仅依赖 Bun 内置的 `bun:sqlite`，无需 Prisma 引擎，可在 Prisma Client 初始化之前安全运行。
 */

const SQLITE_BASELINE_NAME = "0_sqlite_baseline";
const FIRST_PRIVATE_MESSAGE_MIGRATION_NAME = "20260713120000_auto_register_on_first_private_message";
const PUBLISH_IMMEDIATELY_MIGRATION_NAME = "20260722120000_add_post_publish_immediately";
const BOT_HEALTH_INBOX_MIGRATION_NAME = "20260827120000_add_bot_health_and_message_inbox";
const OLD_PRIVATE_MESSAGE_REPLY = `发送 #注册账号 可以用当前 QQ 注册本校园墙账号。
发送 #重置密码 可以重置你的登录密码。`;
const NEW_PRIVATE_MESSAGE_REPLY = `首次私聊会自动注册 Campux 账号。
发送 #投稿 开始投稿。
忘记密码时，请发送 #重置密码 获取新密码。`;

const PRISMA_MIGRATIONS_DDL_SQLITE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export interface SqliteMigrateResult {
  applied: string[];
  skipped: string[];
}

export interface SqliteMigrateLogger {
  info: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

function checksumOf(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * 把 `file:/path/to.db` / `sqlite:/path` / 裸路径 归一化为磁盘文件路径。
 * 支持 `file:./data/campux.db`（相对当前工作目录）与 `file:/abs/path.db`（绝对）。
 */
export function sqliteFilePathFromUrl(databaseUrl: string): string {
  let p = databaseUrl.trim();
  if (p.startsWith("file:")) p = p.slice("file:".length);
  else if (p.startsWith("sqlite://")) p = p.slice("sqlite://".length);
  else if (p.startsWith("sqlite:")) p = p.slice("sqlite:".length);
  // 去掉可能的查询串（?connection_limit=... 之类，SQLite 用不到）
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p;
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function applyFirstPrivateMessageSqliteMigration(
  db: Database,
  doneNames: Set<string>,
  applied: string[],
  skipped: string[],
  logger: SqliteMigrateLogger,
): void {
  const botTable = db
    .query(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'BotAccount'`)
    .get() as { sql: string } | null;
  // Small migration-unit tests and pre-Campux databases may not contain this product table.
  if (!botTable) return;

  if (doneNames.has(FIRST_PRIVATE_MESSAGE_MIGRATION_NAME)) {
    skipped.push(FIRST_PRIVATE_MESSAGE_MIGRATION_NAME);
    return;
  }

  const oldDefault = `DEFAULT ${sqlStringLiteral(OLD_PRIVATE_MESSAGE_REPLY)}`;
  const newDefault = `DEFAULT ${sqlStringLiteral(NEW_PRIVATE_MESSAGE_REPLY)}`;
  const schemaObjects = db
    .query(
      `SELECT type, name, sql FROM sqlite_master
       WHERE tbl_name = 'BotAccount' AND type IN ('index', 'trigger') AND sql IS NOT NULL
       ORDER BY type, name`,
    )
    .all() as Array<{ type: string; name: string; sql: string }>;

  logger.info({ migration: FIRST_PRIVATE_MESSAGE_MIGRATION_NAME }, "applying sqlite incremental migration");
  // Rebuilding a referenced table requires foreign_keys=OFF outside the transaction. The
  // transaction plus foreign_key_check still makes the operation atomic and integrity-checked.
  db.exec("PRAGMA foreign_keys=OFF");
  db.exec("BEGIN");
  try {
    if (botTable.sql.includes(oldDefault)) {
      const temporaryTable = "BotAccount__first_private_message_migration";
      const createSql = botTable.sql
        .replace(/^CREATE TABLE\s+"?BotAccount"?/i, `CREATE TABLE ${quoteIdentifier(temporaryTable)}`)
        .replace(oldDefault, newDefault);
      if (createSql === botTable.sql || !createSql.includes(newDefault)) {
        throw new Error("could not rewrite BotAccount userMessageReply default");
      }

      const columns = (
        db.query(`SELECT name FROM pragma_table_info('BotAccount') ORDER BY cid`).all() as Array<{ name: string }>
      ).map((row) => quoteIdentifier(row.name));
      const columnList = columns.join(", ");
      db.exec(createSql);
      db.exec(
        `INSERT INTO ${quoteIdentifier(temporaryTable)} (${columnList}) SELECT ${columnList} FROM "BotAccount"`,
      );
      db.exec(`DROP TABLE "BotAccount"`);
      db.exec(`ALTER TABLE ${quoteIdentifier(temporaryTable)} RENAME TO "BotAccount"`);
      for (const schemaObject of schemaObjects) {
        db.exec(schemaObject.sql);
      }
    } else if (!botTable.sql.includes(newDefault)) {
      throw new Error("BotAccount userMessageReply has an unrecognized default; refusing unsafe schema rewrite");
    }

    db.run(`UPDATE "BotAccount" SET "userMessageReply" = ? WHERE "userMessageReply" = ?`, [
      NEW_PRIVATE_MESSAGE_REPLY,
      OLD_PRIVATE_MESSAGE_REPLY,
    ]);
    db.run(
      `INSERT INTO "_prisma_migrations"
         ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [
        randomUUID(),
        checksumOf(`${oldDefault}\n${newDefault}`),
        FIRST_PRIVATE_MESSAGE_MIGRATION_NAME,
      ],
    );
    const violations = db.query("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`sqlite migration introduced ${violations.length} foreign-key violation(s)`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys=ON");
  }

  doneNames.add(FIRST_PRIVATE_MESSAGE_MIGRATION_NAME);
  applied.push(FIRST_PRIVATE_MESSAGE_MIGRATION_NAME);
  logger.info({ migration: FIRST_PRIVATE_MESSAGE_MIGRATION_NAME }, "sqlite incremental migration applied");
}

function applyPublishImmediatelySqliteMigration(
  db: Database,
  doneNames: Set<string>,
  applied: string[],
  skipped: string[],
  logger: SqliteMigrateLogger,
): void {
  const postTable = db
    .query(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Post'`)
    .get() as { sql: string } | null;
  if (!postTable) return;

  if (doneNames.has(PUBLISH_IMMEDIATELY_MIGRATION_NAME)) {
    skipped.push(PUBLISH_IMMEDIATELY_MIGRATION_NAME);
    return;
  }

  const columns = db
    .query(`SELECT name FROM pragma_table_info('Post')`)
    .all() as Array<{ name: string }>;
  const hasColumn = columns.some((column) => column.name === "publishImmediately");

  logger.info({ migration: PUBLISH_IMMEDIATELY_MIGRATION_NAME }, "applying sqlite incremental migration");
  db.exec("BEGIN");
  try {
    if (!hasColumn) {
      db.exec(`ALTER TABLE "Post" ADD COLUMN "publishImmediately" BOOLEAN NOT NULL DEFAULT false`);
    }
    db.run(
      `INSERT INTO "_prisma_migrations"
         ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [
        randomUUID(),
        checksumOf('ALTER TABLE "Post" ADD COLUMN "publishImmediately" BOOLEAN NOT NULL DEFAULT false'),
        PUBLISH_IMMEDIATELY_MIGRATION_NAME,
      ],
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  doneNames.add(PUBLISH_IMMEDIATELY_MIGRATION_NAME);
  applied.push(PUBLISH_IMMEDIATELY_MIGRATION_NAME);
  logger.info({ migration: PUBLISH_IMMEDIATELY_MIGRATION_NAME }, "sqlite incremental migration applied");
}

function applyBotHealthInboxSqliteMigration(
  db: Database,
  doneNames: Set<string>,
  applied: string[],
  skipped: string[],
  logger: SqliteMigrateLogger,
): void {
  const productTables = db
    .query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Tenant', 'BotAccount')`,
    )
    .all() as Array<{ name: string }>;
  // Small migration-unit fixtures and pre-Campux databases may not contain
  // the product tables. Leave those databases untouched, as the other
  // forward migrations do.
  if (productTables.length < 2) return;

  if (doneNames.has(BOT_HEALTH_INBOX_MIGRATION_NAME)) {
    skipped.push(BOT_HEALTH_INBOX_MIGRATION_NAME);
    return;
  }

  logger.info({ migration: BOT_HEALTH_INBOX_MIGRATION_NAME }, "applying sqlite incremental migration");
  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "BotHealthIncident" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "botAccountId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "resolvedAt" DATETIME,
        "reason" TEXT NOT NULL,
        "details" JSONB,
        "faultNotifiedAt" DATETIME,
        "recoveryNotifiedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "BotHealthIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BotHealthIncident_botAccountId_fkey" FOREIGN KEY ("botAccountId") REFERENCES "BotAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "BotMessageInbox" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "botAccountId" TEXT NOT NULL,
        "eventKey" TEXT NOT NULL,
        "rawEvent" JSONB NOT NULL,
        "messageType" TEXT NOT NULL,
        "conversationKey" TEXT NOT NULL,
        "eventTime" DATETIME,
        "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lockedAt" DATETIME,
        "lastError" TEXT,
        "processedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "BotMessageInbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BotMessageInbox_botAccountId_fkey" FOREIGN KEY ("botAccountId") REFERENCES "BotAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "BotHealthIncident_tenantId_botAccountId_kind_resolvedAt_idx" ON "BotHealthIncident" ("tenantId", "botAccountId", "kind", "resolvedAt");
      CREATE INDEX IF NOT EXISTS "BotHealthIncident_botAccountId_kind_startedAt_idx" ON "BotHealthIncident" ("botAccountId", "kind", "startedAt");
      CREATE INDEX IF NOT EXISTS "BotMessageInbox_botAccountId_status_availableAt_idx" ON "BotMessageInbox" ("botAccountId", "status", "availableAt");
      CREATE INDEX IF NOT EXISTS "BotMessageInbox_tenantId_status_availableAt_idx" ON "BotMessageInbox" ("tenantId", "status", "availableAt");
      CREATE INDEX IF NOT EXISTS "BotMessageInbox_conversationKey_status_availableAt_idx" ON "BotMessageInbox" ("conversationKey", "status", "availableAt");
      CREATE INDEX IF NOT EXISTS "BotMessageInbox_processedAt_idx" ON "BotMessageInbox" ("processedAt");
      CREATE UNIQUE INDEX IF NOT EXISTS "BotMessageInbox_botAccountId_eventKey_key" ON "BotMessageInbox" ("botAccountId", "eventKey");
    `);
    db.run(
      `INSERT INTO "_prisma_migrations"
         ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [randomUUID(), checksumOf(BOT_HEALTH_INBOX_MIGRATION_NAME), BOT_HEALTH_INBOX_MIGRATION_NAME],
    );
    const violations = db.query("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`sqlite migration introduced ${violations.length} foreign-key violation(s)`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  doneNames.add(BOT_HEALTH_INBOX_MIGRATION_NAME);
  applied.push(BOT_HEALTH_INBOX_MIGRATION_NAME);
  logger.info({ migration: BOT_HEALTH_INBOX_MIGRATION_NAME }, "sqlite incremental migration applied");
}

/**
 * 应用 SQLite baseline 建库脚本及后续增量迁移（幂等）。
 *
 * @param baselineSql 内嵌的建库 DDL（sqlite-baseline.sql 文本）
 * @param databaseUrl 形如 `file:./data/campux.db`
 */
export function applySqliteBaseline(
  baselineSql: string,
  databaseUrl: string,
  logger: SqliteMigrateLogger = console,
): SqliteMigrateResult {
  const filePath = sqliteFilePathFromUrl(databaseUrl);
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const db = new Database(filePath);
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    db.exec("PRAGMA foreign_keys=ON;");
    // SQLite 默认 journal；WAL 对单文件服务的并发读更友好。
    db.exec("PRAGMA journal_mode=WAL;");
    db.exec(PRISMA_MIGRATIONS_DDL_SQLITE);

    const done = db
      .query(`SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`)
      .all() as Array<{ migration_name: string }>;
    const doneNames = new Set(done.map((r) => r.migration_name));

    if (doneNames.has(SQLITE_BASELINE_NAME)) {
      skipped.push(SQLITE_BASELINE_NAME);
      logger.info({ skipped: skipped.length }, "sqlite baseline already applied");
    } else {
      const checksum = checksumOf(baselineSql);
      const id = randomUUID();

      logger.info({ migration: SQLITE_BASELINE_NAME }, "applying sqlite baseline schema");

      // bun:sqlite 的 exec 支持多语句；整个 baseline 在一个事务里执行，失败回滚。
      db.exec("BEGIN");
      try {
        db.exec(baselineSql);
        db.run(
          `INSERT INTO "_prisma_migrations"
             ("id","checksum","migration_name","started_at","finished_at","applied_steps_count")
           VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
          [id, checksum, SQLITE_BASELINE_NAME],
        );
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      doneNames.add(SQLITE_BASELINE_NAME);
      applied.push(SQLITE_BASELINE_NAME);
      logger.info({ applied }, "sqlite baseline applied");
    }

    applyFirstPrivateMessageSqliteMigration(db, doneNames, applied, skipped, logger);
    applyPublishImmediatelySqliteMigration(db, doneNames, applied, skipped, logger);
    applyBotHealthInboxSqliteMigration(db, doneNames, applied, skipped, logger);
    return { applied, skipped };
  } finally {
    db.close();
  }
}
