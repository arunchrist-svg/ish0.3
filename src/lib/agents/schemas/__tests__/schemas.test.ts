import { describe, expect, it } from "vitest";
import { parseWriterOutput } from "@/lib/agents/schemas/writer-output";
import { parseResearcherOutput } from "@/lib/agents/schemas/researcher-output";
import { parseGiftIntelExtractions } from "@/lib/agents/schemas/brand-intel-output";

describe("agent output schemas", () => {
  it("parseWriterOutput accepts valid JSON object", () => {
    const raw = JSON.stringify({
      subjectA: "Diwali gifting for Acme",
      subjectB: "Quick note for Acme",
      subjectC: "A taste of Diwali, before you decide",
      emailBody: "Hi Raj,\n\nWould a tasting sample this week work for your team?\n\nSrilaksha, Partnerships, India Sweet House.",
      emailBodyB: "Hi Raj,\n\nDiwali sneaks up fast. Should I send Acme a sampler this week?\n\nSrilaksha\nPartnerships, India Sweet House",
      emailBodyC: "Hi Raj,\n\nI will leave it here. A tasting box stays available.\n\nSrilaksha\nPartnerships, India Sweet House",
      outreachGoal: "Book a call",
    });
    const { data, valid } = parseWriterOutput(raw);
    expect(valid).toBe(true);
    expect(data.subjectA).toContain("Acme");
    expect(data.subjectC).toMatch(/taste of Diwali/i);
    expect(data.emailBodyB).toMatch(/sampler/i);
    expect(data.emailBodyC).toMatch(/leave it here/i);
  });

  it("parseWriterOutput marks invalid writer JSON", () => {
    const { valid } = parseWriterOutput("not json at all");
    expect(valid).toBe(false);
  });

  it("does not treat truncated JSON dump as an email body", () => {
    const raw = '```json\n{\n"subjectA": "Diwali gifting for Seg Automotive",\n"subjectB": "Bala, Seg Automotive team gifts",\n"emailBody": "Hi\n';
    const { valid, data } = parseWriterOutput(raw);
    expect(valid).toBe(false);
    expect(data.emailBody).toBeUndefined();
  });

  it("recovers a complete emailBody from truncated JSON when the string is long enough", () => {
    const raw =
      '{"subjectA":"Diwali gifting for Acme","emailBody":"Hi Raj,\\n\\nWould a tasting sample this week work for your team in Pune? No worries if timing is off.\\n\\nSrilaksha, Partnerships, India Sweet House."';
    const { valid, data } = parseWriterOutput(raw);
    expect(valid).toBe(true);
    expect(data.emailBody).toContain("Hi Raj");
    expect(data.emailBody).not.toContain("subjectA");
  });

  it("parseResearcherOutput accepts valid brief", () => {
    const raw = JSON.stringify({
      outreachHook: "Diwali hampers for 500+ employees",
      estimatedOrderValue: "₹2–8 lakhs",
      decisionChain: ["Raj Kumar"],
      outreachHooks: ["Diwali season"],
      scoreFactors: [{ label: "Budget", bold: "₹5L" }],
    });
    const { data, valid } = parseResearcherOutput(raw);
    expect(valid).toBe(true);
    expect(data?.outreachHook).toContain("Diwali");
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
