import { describe, expect, it } from "vitest";
import { deriveEmailLogStatus } from "@/lib/email/log-status";

describe("deriveEmailLogStatus", () => {
  it("returns bounced when bouncedAt is set, even if opened", () => {
    expect(
      deriveEmailLogStatus({
        bouncedAt: "2026-08-17T10:00:00Z",
        openedAt: "2026-08-17T09:00:00Z",
      }),
    ).toBe("bounced");
  });

  it("returns opened when openedAt is set and not bounced", () => {
    expect(deriveEmailLogStatus({ bouncedAt: null, openedAt: "2026-08-17T09:00:00Z" })).toBe("opened");
  });

  it("returns delivered for a sent row with no open or bounce", () => {
    expect(deriveEmailLogStatus({ bouncedAt: null, openedAt: null })).toBe("delivered");
  });
});
