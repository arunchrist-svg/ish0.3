import { describe, expect, it } from "vitest";
import {
  CREDIT_COST_CATALOG,
  CREDIT_COSTS,
  getCreditCost,
  labelForCreditAction,
} from "@/lib/billing/credit-costs";

describe("credit cost catalog", () => {
  it("keeps CREDIT_COSTS in sync with the catalog", () => {
    for (const item of CREDIT_COST_CATALOG) {
      expect(CREDIT_COSTS[item.action]).toBe(item.credits);
    }
    expect(Object.keys(CREDIT_COSTS)).toHaveLength(CREDIT_COST_CATALOG.length);
  });

  it("returns labeled costs for billed actions", () => {
    expect(getCreditCost("writer.draft")).toBe(8);
    expect(getCreditCost("writer.draft") * 3).toBe(24);
    expect(labelForCreditAction("scout.contact")).toBe("Scout a contact");
    expect(labelForCreditAction("writer.draft")).toBe("Writing smart emails");
    expect(labelForCreditAction("unknown.action")).toBe("unknown.action");
  });
});
