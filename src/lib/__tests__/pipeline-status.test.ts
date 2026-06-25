import { describe, expect, it } from "vitest";
import {
  statusToPipelineIndex,
  statusToDisplayLabel,
  isManualStage,
  isPastReplyStage,
  canManuallyAdvance,
  getNextManualStatus,
  isContactReadyStage,
  isEmailStage,
  deriveQueueAction,
  parseDealAmount,
  PIPELINE_STAGES,
} from "@/lib/pipeline-status";

describe("FUNNEL-UNIT-001 pipeline status mapping", () => {
  it("maps early statuses to Contact Ready index", () => {
    expect(statusToPipelineIndex("scouted")).toBe(0);
    expect(statusToPipelineIndex("prefiltered")).toBe(0);
    expect(statusToPipelineIndex("researched")).toBe(0);
  });

  it("maps email-stage statuses to index 1", () => {
    expect(statusToPipelineIndex("draft_ready")).toBe(1);
    expect(statusToPipelineIndex("approved")).toBe(1);
    expect(statusToPipelineIndex("outreached")).toBe(1);
  });

  it("maps replied to Open stage", () => {
    expect(statusToPipelineIndex("replied")).toBe(2);
    expect(statusToDisplayLabel("replied")).toBe("Open");
  });

  it("maps manual stages correctly", () => {
    expect(statusToPipelineIndex("tasting_sent")).toBe(3);
    expect(statusToPipelineIndex("negotiate")).toBe(4);
    expect(statusToPipelineIndex("closed")).toBe(5);
    expect(statusToPipelineIndex("po_closed")).toBe(5);
  });

  it("defaults unknown status to index 0", () => {
    expect(statusToPipelineIndex("unknown_status")).toBe(0);
    expect(statusToDisplayLabel("custom_stage")).toBe("custom stage");
  });

  it("identifies manual stages", () => {
    expect(isManualStage("tasting_sent")).toBe(true);
    expect(isManualStage("negotiate")).toBe(true);
    expect(isManualStage("closed")).toBe(true);
    expect(isManualStage("replied")).toBe(false);
  });

  it("identifies past-reply stages", () => {
    expect(isPastReplyStage("replied")).toBe(false);
    expect(isPastReplyStage("tasting_sent")).toBe(true);
    expect(isPastReplyStage("po_closed")).toBe(true);
  });
});

describe("FUNNEL-UNIT-002 manual transitions", () => {
  it("allows valid manual advances only", () => {
    expect(canManuallyAdvance("replied", "tasting_sent")).toBe(true);
    expect(canManuallyAdvance("tasting_sent", "negotiate")).toBe(true);
    expect(canManuallyAdvance("negotiate", "closed")).toBe(true);
    expect(canManuallyAdvance("replied", "closed")).toBe(false);
    expect(canManuallyAdvance("scouted", "replied")).toBe(false);
  });

  it("returns next manual status", () => {
    expect(getNextManualStatus("replied")).toBe("tasting_sent");
    expect(getNextManualStatus("tasting_sent")).toBe("negotiate");
    expect(getNextManualStatus("negotiate")).toBe("closed");
    expect(getNextManualStatus("scouted")).toBeNull();
  });
});

describe("FUNNEL-UNIT-003 stage helpers", () => {
  it("identifies contact-ready and email stages", () => {
    expect(isContactReadyStage("scouted")).toBe(true);
    expect(isContactReadyStage("draft_ready")).toBe(false);
    expect(isEmailStage("draft_ready")).toBe(true);
    expect(isEmailStage("scouted")).toBe(false);
  });

  it("derives queue actions by status", () => {
    expect(deriveQueueAction("scouted")).toBe("Awaiting research");
    expect(deriveQueueAction("draft_ready")).toBe("Approve email");
    expect(deriveQueueAction("replied")).toBe("Mark tasting sent");
    expect(deriveQueueAction("closed")).toBe("Deal closed");
  });

  it("parses deal amounts from Indian currency strings", () => {
    expect(parseDealAmount("₹18,00,000")).toBe(1800000);
    expect(parseDealAmount("invalid")).toBeNull();
    expect(parseDealAmount("")).toBeNull();
  });

  it("defines six pipeline stage labels", () => {
    expect(PIPELINE_STAGES).toHaveLength(6);
  });
});
