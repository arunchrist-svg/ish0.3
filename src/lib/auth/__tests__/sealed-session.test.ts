import { describe, expect, it } from "vitest";
import {
  sealTenantClaims,
  unsealTenantClaims,
} from "@/lib/auth/sealed-session";

describe("sealed-session", () => {
  it("round-trips claims and rejects tampering", () => {
    const sealed = sealTenantClaims({
      userId: "u1",
      tenantId: "t1",
      workspaceId: "w1",
      role: "admin",
      platformRole: "user",
      tenantSlug: "acme",
      onboardingStatus: "complete",
      onboardingStep: 3,
      demoMode: false,
      mustChangePassword: false,
    });
    const claims = unsealTenantClaims(sealed);
    expect(claims?.userId).toBe("u1");
    expect(claims?.tenantId).toBe("t1");
    expect(claims?.workspaceId).toBe("w1");

    const [payload, sig] = sealed.split(".");
    expect(unsealTenantClaims(`${payload}.tampered${sig}`)).toBeNull();
    expect(unsealTenantClaims(undefined)).toBeNull();
  });
});
