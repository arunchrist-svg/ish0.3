import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DbInstance =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>;

function isLocalDatabase(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

function sanitizeDatabaseUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, "");
}

function createDb(): DbInstance {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const url = sanitizeDatabaseUrl(rawUrl);
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error("DATABASE_URL is not a valid Postgres connection string");
  }

  if (isLocalDatabase(url)) {
    const pool = new Pool({ connectionString: url });
    return drizzlePg(pool, { schema });
  }

  const sql = neon(url);
  return drizzleNeon(sql, { schema });
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
