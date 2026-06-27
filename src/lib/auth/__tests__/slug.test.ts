import { describe, expect, it } from "vitest";
import { slugifyTenantName, normalizeTenantSlug } from "@/lib/auth/slug";

describe("slug utils", () => {
  it("slugifyTenantName produces safe slug", () => {
    expect(slugifyTenantName("Acme Corp!")).toBe("acme-corp");
    expect(slugifyTenantName("  Hello   World  ")).toBe("hello-world");
  });

  it("normalizeTenantSlug lowercases", () => {
    expect(normalizeTenantSlug("My-Org")).toBe("my-org");
  });
});
