import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

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

function createDb(): DbInstance {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const url = normalizeDatabaseUrl(sanitizeDatabaseUrl(rawUrl));
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error("DATABASE_URL is not a valid Postgres connection string");
  }

  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

let _db: DbInstance | undefined;

export function getDb(): DbInstance {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export * from "./schema";
