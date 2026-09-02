import { describe, expect, it } from "vitest";
import { discoverPeople } from "@/lib/enrichment/waterfall";

describe("people provider policy", () => {
  it("short-circuits People Off before domain or people search", async () => {
    const result = await discoverPeople({
      tenantId: "tenant-test",
      workspaceId: "workspace-test",
      companyName: "Example Industries",
      dataMode: "free",
      config: {
        peopleSearchProvider: "none",
      },
    });

    expect(result.people).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("People search is turned off. Select Tavily or Apollo to find contacts.");
    expect(result.qualityMetrics?.returned).toBe(0);
  });
});
