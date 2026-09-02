import { describe, expect, it } from "vitest";
import { enrichContactInput } from "@/lib/agent/tools/enrich-contact";
import { scheduleCadenceInput } from "@/lib/agent/tools/schedule-cadence";
import { updateLeadStatusInput } from "@/lib/agent/tools/update-lead-status";

const leadId = "00000000-0000-0000-0000-000000000001";

describe("agent tool schemas", () => {
  it("accepts a valid lead status update", () => {
    expect(
      updateLeadStatusInput.parse({
        leadId,
        status: "closed",
        closedDealAmount: "₹5 lakhs",
      }),
    ).toMatchObject({ leadId, status: "closed" });
  });

  it("rejects unsupported status transitions at the input boundary", () => {
    expect(() =>
      updateLeadStatusInput.parse({
        leadId,
        status: "outreached",
      }),
    ).toThrow();
  });

  it("provides safe defaults for enrichment", () => {
    expect(enrichContactInput.parse({ leadId })).toMatchObject({
      leadId,
      mode: "free",
      refetch: false,
    });
  });

  it("limits cadence actions to existing sequence controls", () => {
    expect(() => scheduleCadenceInput.parse({ leadId, action: "send" })).toThrow();
    expect(scheduleCadenceInput.parse({ leadId, action: "pause" })).toEqual({
      leadId,
      action: "pause",
    });
  });
});
