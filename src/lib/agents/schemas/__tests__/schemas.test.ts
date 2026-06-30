import { describe, expect, it } from "vitest";
import { parseWriterOutput } from "@/lib/agents/schemas/writer-output";
import { parseResearcherOutput } from "@/lib/agents/schemas/researcher-output";
import { parseGiftIntelExtractions } from "@/lib/agents/schemas/gift-intel-output";

describe("agent output schemas", () => {
  it("parseWriterOutput accepts valid JSON object", () => {
    const raw = JSON.stringify({
      subjectA: "Diwali gifting for Acme",
      subjectB: "Quick note for Acme",
      emailBody: "Hi Raj,\n\nShort body.",
      outreachGoal: "Book a call",
    });
    const { data, valid } = parseWriterOutput(raw);
    expect(valid).toBe(true);
    expect(data.subjectA).toContain("Acme");
  });

  it("parseWriterOutput marks invalid writer JSON", () => {
    const { valid } = parseWriterOutput("not json at all");
    expect(valid).toBe(false);
  });

  it("parseResearcherOutput accepts valid brief", () => {
    const raw = JSON.stringify({
      giftingHook: "Diwali hampers for 500+ employees",
      estimatedOrderValue: "₹2–8 lakhs",
      decisionChain: ["Raj Kumar"],
      outreachHooks: ["Diwali season"],
      scoreFactors: [{ label: "Budget", bold: "₹5L" }],
    });
    const { data, valid } = parseResearcherOutput(raw);
    expect(valid).toBe(true);
    expect(data?.giftingHook).toContain("Diwali");
  });

  it("parseGiftIntelExtractions filters invalid rows", () => {
    const raw = JSON.stringify([
      { is_target_gifting_event: true, confidence_score: 0.9, evidence_rationale: "clear gift post" },
      "bad-row",
      { confidence_score: "not-a-number" },
    ]);
    const rows = parseGiftIntelExtractions(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_target_gifting_event).toBe(true);
  });
});
