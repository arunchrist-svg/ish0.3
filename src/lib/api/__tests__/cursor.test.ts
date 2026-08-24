import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, parseListLimit } from "@/lib/api/cursor";

describe("cursor pagination", () => {
  it("round-trips createdAt and id", () => {
    const iso = "2026-08-24T10:00:00.000Z";
    const id = "5485962a-0f3a-4ede-98fc-fc4b2b6109b0";
    const cursor = encodeCursor(iso, id);
    const decoded = decodeCursor(cursor);
    expect(decoded?.id).toBe(id);
    expect(decoded?.createdAt.toISOString()).toBe(iso);
  });

  it("rejects garbage", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it("clamps list limit", () => {
    expect(parseListLimit(null)).toBe(50);
    expect(parseListLimit("10")).toBe(10);
    expect(parseListLimit("9999")).toBe(100);
  });
});
