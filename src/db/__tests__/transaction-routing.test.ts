import { beforeEach, describe, expect, it, vi } from "vitest";

const httpTransaction = vi.fn(async () => {
  throw new Error("No transactions support in neon-http driver");
});
const wsTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ kind: "ws-tx" }));

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => ({ query: vi.fn() })),
  Pool: vi.fn(function NeonPoolMock(this: { end?: () => void }) {
    this.end = vi.fn();
  }),
  neonConfig: { webSocketConstructor: undefined as unknown },
}));

vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: vi.fn(() => ({
    transaction: httpTransaction,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  })),
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn(() => ({
    transaction: wsTransaction,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  })),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({
    transaction: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {},
  })),
}));

vi.mock("pg", () => ({
  Pool: vi.fn(function PgPoolMock() {
    return {};
  }),
}));

describe("db transaction routing on neon-http", () => {
  beforeEach(() => {
    vi.resetModules();
    httpTransaction.mockClear();
    wsTransaction.mockClear();
    process.env.DATABASE_URL = "postgresql://user:pass@ep-test.neon.tech/neondb?sslmode=require";
    delete process.env.FORCE_PG_POOL;
  });

  it("routes db.transaction through WebSocket Pool instead of neon-http", async () => {
    const { db, getDbDriver } = await import("@/db/index");

    expect(getDbDriver()).toBe("neon-http");

    const result = await db.transaction(async (tx) => {
      expect(tx).toEqual({ kind: "ws-tx" });
      return "ok";
    });

    expect(result).toBe("ok");
    expect(httpTransaction).not.toHaveBeenCalled();
    expect(wsTransaction).toHaveBeenCalledTimes(1);
  });

  it("exposes runInTransaction with the same WebSocket route", async () => {
    const { runInTransaction, getDbDriver } = await import("@/db/index");

    expect(getDbDriver()).toBe("neon-http");
    await expect(runInTransaction(async () => "done")).resolves.toBe("done");
    expect(wsTransaction).toHaveBeenCalled();
    expect(httpTransaction).not.toHaveBeenCalled();
  });
});
