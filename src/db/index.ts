import { drizzle } from "drizzle-orm/node-postgres";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;
type SchemaRelations = ExtractTablesWithRelations<typeof schema>;
type TxClient = PgTransaction<PgQueryResultHKT, typeof schema, SchemaRelations>;
type TxCallback<T> = (tx: TxClient) => Promise<T>;

type DbDriver = "pg" | "neon-http";

function sanitizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, "");
}

function isLocalDatabase(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

/** pg v8+ warns when sslmode=require is used; Neon works with verify-full. */
function normalizeDatabaseUrl(url: string): string {
  if (isLocalDatabase(url)) return url;

  try {
    const parsed = new URL(url);
    const ssl = parsed.searchParams.get("sslmode");
    if (!ssl || ssl === "require" || ssl === "prefer" || ssl === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
    }
    return parsed.toString();
  } catch {
    return url.replace(/sslmode=(require|prefer|verify-ca)/gi, "sslmode=verify-full");
  }
}

function requireDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = normalizeDatabaseUrl(sanitizeDatabaseUrl(rawUrl));
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error("DATABASE_URL is not a valid Postgres connection string");
  }
  return url;
}

function createLocalDb(url: string): DbInstance {
  const pool = new Pool({ connectionString: url, max: 10 });
  return drizzle(pool, { schema });
}

async function createNeonHttpDb(url: string): Promise<DbInstance> {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle: drizzleNeon } = await import("drizzle-orm/neon-http");
  const sql = neon(url);
  return drizzleNeon(sql, { schema }) as unknown as DbInstance;
}

let _db: DbInstance | undefined;
let _dbPromise: Promise<DbInstance> | undefined;
let _driver: DbDriver = "pg";
let _resolvedUrl: string | undefined;

/** Neon HTTP cannot run interactive transactions; keep a WebSocket Pool for those. */
let _txDb: DbInstance | undefined;
let _txDbPromise: Promise<DbInstance> | undefined;

function createLocalAndSet(url: string): DbInstance {
  _driver = "pg";
  _resolvedUrl = url;
  _db = createLocalDb(url);
  return _db;
}

function createNeonHttpAndSet(url: string, instance: DbInstance): DbInstance {
  _driver = "neon-http";
  _resolvedUrl = url;
  _db = instance;
  return _db;
}

export function getDb(): DbInstance {
  if (_db) return _db;
  const url = requireDatabaseUrl();

  if (isLocalDatabase(url) || process.env.FORCE_PG_POOL === "1") {
    return createLocalAndSet(url);
  }

  // Sync path for Neon: nest neon-http via deasync-free pattern using cached promise bootstrap.
  // Prefer sync neon when already loaded.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neon } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzleNeon } = require("drizzle-orm/neon-http") as typeof import("drizzle-orm/neon-http");
    const sql = neon(url);
    return createNeonHttpAndSet(url, drizzleNeon(sql, { schema }) as unknown as DbInstance);
  } catch {
    return createLocalAndSet(url);
  }
}

/** Optional async warmup for Neon (tests / scripts). */
export async function warmDb(): Promise<DbInstance> {
  if (_db) return _db;
  const url = requireDatabaseUrl();
  if (isLocalDatabase(url) || process.env.FORCE_PG_POOL === "1") {
    return createLocalAndSet(url);
  }
  if (!_dbPromise) {
    _dbPromise = createNeonHttpDb(url).then((d) => createNeonHttpAndSet(url, d));
  }
  return _dbPromise;
}

export function getDbDriver(): DbDriver {
  getDb();
  return _driver;
}

async function getWebSocketTxDb(): Promise<DbInstance> {
  if (_txDb) return _txDb;
  if (_txDbPromise) return _txDbPromise;

  const url = _resolvedUrl ?? requireDatabaseUrl();
  _txDbPromise = (async () => {
    const { Pool: NeonPool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle: drizzleNeonWs } = await import("drizzle-orm/neon-serverless");

    // Node < 22 (and some serverless images) lack a global WebSocket.
    if (typeof globalThis.WebSocket === "undefined") {
      const { default: ws } = await import("ws");
      neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
    }

    const pool = new NeonPool({ connectionString: url, max: 5 });
    _txDb = drizzleNeonWs(pool, { schema }) as unknown as DbInstance;
    return _txDb;
  })();

  try {
    return await _txDbPromise;
  } catch (err) {
    _txDbPromise = undefined;
    throw err;
  }
}

/**
 * Interactive transactions. On neon-http (default for remote Neon), routes to a
 * WebSocket Pool because the HTTP driver throws "No transactions support".
 */
export async function runInTransaction<T>(fn: TxCallback<T>, config?: unknown): Promise<T> {
  getDb();
  if (_driver === "neon-http") {
    const txDb = await getWebSocketTxDb();
    return txDb.transaction(fn as never, config as never);
  }
  return getDb().transaction(fn as never, config as never);
}

export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    // neon-http's .transaction() always throws; route through WebSocket Pool instead.
    if (prop === "transaction") {
      return (fn: TxCallback<unknown>, config?: unknown) => runInTransaction(fn, config);
    }
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

/** Test helper: reset cached clients between unit tests. */
export function __resetDbForTests(): void {
  _db = undefined;
  _dbPromise = undefined;
  _txDb = undefined;
  _txDbPromise = undefined;
  _driver = "pg";
  _resolvedUrl = undefined;
}

export * from "./schema";
