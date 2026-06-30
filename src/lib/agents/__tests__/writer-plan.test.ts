import { describe, expect, it } from "vitest";
import {
  assertResearchReadyForWriter,
  formatWriterPlanForPrompt,
  getResearchQualityGaps,
  ResearchNotReadyError,
  writerPlanSchema,
} from "@/lib/agents/writer-plan";

describe("writer-plan", () => {
  it("detects missing research fields", () => {
    expect(getResearchQualityGaps({ giftingHook: "", decisionChain: [] })).toEqual([
      "giftingHook",
      "decisionChain",
    ]);
  });

  it("passes when research is complete", () => {
    expect(() =>
      assertResearchReadyForWriter({
        giftingHook: "Diwali hampers for Bangalore IT teams",
        decisionChain: ["Priya Sharma"],
      }),
    ).not.toThrow();
  });

  it("throws ResearchNotReadyError when hook missing", () => {
    expect(() => assertResearchReadyForWriter({ giftingHook: "", decisionChain: ["x"] })).toThrow(
      ResearchNotReadyError,
    );
  });

  it("formats plan for writer prompt", () => {
    const text = formatWriterPlanForPrompt({
      hook: "Campus expansion",
      valueProp: "Premium hampers",
      cta: "Open to options?",
    });
    expect(text).toContain("Hook:");
    expect(text).toContain("Campus expansion");
  });

  it("validates writer plan schema", () => {
    const parsed = writerPlanSchema.safeParse({
      hook: "Specific hook line here",
      valueProp: "Clear value for HR teams",
      cta: "Soft CTA question here?",
    });
    expect(parsed.success).toBe(true);
  });
});
