import { and, desc, lt, or, eq, type SQL, type Column } from "drizzle-orm";

export const DEFAULT_LIST_PAGE_SIZE = 50;
export const MAX_LIST_PAGE_SIZE = 100;

export function parseListLimit(raw: string | null, fallback = DEFAULT_LIST_PAGE_SIZE): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_LIST_PAGE_SIZE);
}

/** Opaque cursor: `${isoCreatedAt}|${id}` */
export function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(`${iso}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): { createdAt: Date; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    if (sep <= 0) return null;
    const iso = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    const createdAt = new Date(iso);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** WHERE for keyset pagination ordered by created_at DESC, id DESC */
export function keysetBefore(
  createdAtCol: Column,
  idCol: Column,
  cursor: { createdAt: Date; id: string } | null,
): SQL | undefined {
  if (!cursor) return undefined;
  return or(
    lt(createdAtCol, cursor.createdAt),
    and(eq(createdAtCol, cursor.createdAt), lt(idCol, cursor.id)),
  );
}

export function nextCursorFromRows<T extends { createdAt: Date | string; id: string }>(
  rows: T[],
  limit: number,
): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  return encodeCursor(last.createdAt, last.id);
}

// Re-export desc for callers that want consistent ordering
export { desc };
