import { describe, expect, it } from "vitest";
import { INDIA_STATES } from "@/lib/geo/india";
import { INDIA_STATE_PATHS } from "@/lib/geo/india-state-paths";

describe("india state map paths", () => {
  it("covers every scout state id from india-maps-data", () => {
    const pathIds = new Set(INDIA_STATE_PATHS.map((s) => s.id));
    const stateIds = INDIA_STATES.map((s) => s.id);
    expect(pathIds.size).toBe(36);
    expect([...pathIds].sort()).toEqual([...stateIds].sort());
  });

  it("maps Telangana to TS", () => {
    expect(INDIA_STATE_PATHS.find((s) => s.name === "Telangana")?.id).toBe("TS");
  });
});
