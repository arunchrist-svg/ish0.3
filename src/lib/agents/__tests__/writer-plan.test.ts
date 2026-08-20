import { describe, expect, it } from "vitest";
import {
  assertResearchReadyForWriter,
  fallbackResearchBrief,
  getResearchQualityGaps,
  ResearchNotReadyError,
} from "@/lib/agents/writer-plan";

describe("writer-plan", () => {
  it("detects missing research fields", () => {
    expect(getResearchQualityGaps({ outreachHook: "", decisionChain: [] })).toEqual([
      "outreachHook",
      "decisionChain",
    ]);
  });

  it("passes when research is complete", () => {
    expect(() =>
      assertResearchReadyForWriter({
        outreachHook: "Diwali hampers for Bangalore IT teams",
        decisionChain: ["Priya Sharma"],
      }),
    ).not.toThrow();
  });

  it("builds a fallback brief when research has not run", () => {
    const brief = fallbackResearchBrief({
      contactName: "Abhimanyu Sen",
      contactTitle: "President & CHRO",
      accountName: "SEG Automotive",
      brandName: "Nebula",
    });
    expect(brief.outreachHook).toContain("SEG Automotive");
    expect(brief.outreachHook).not.toMatch(/outreach for .+ with /i);
    expect(brief.decisionChain).toEqual(["Abhimanyu Sen"]);
  });

  it("throws ResearchNotReadyError when hook missing", () => {
    expect(() => assertResearchReadyForWriter({ outreachHook: "", decisionChain: ["x"] })).toThrow(
      ResearchNotReadyError,
    );
  });
});
