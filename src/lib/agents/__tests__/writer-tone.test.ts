import { describe, expect, it } from "vitest";
import { getWriterFewShotExample } from "@/lib/agents/writer-tone";

describe("getWriterFewShotExample", () => {
  it("uses appliance copy for prestige", () => {
    const example = getWriterFewShotExample("prestige", "Prestige", "Arun");
    expect(example.toLowerCase()).toContain("mixer");
    expect(example.toLowerCase()).not.toContain("mithai");
  });

  it("uses mithai copy only for ish", () => {
    const example = getWriterFewShotExample("ish", "India Sweet House", "Arun");
    expect(example.toLowerCase()).toContain("mithai");
  });

  it("builds custom example from product summary, not mithai", () => {
    const example = getWriterFewShotExample(
      "custom",
      "Acme Gifts",
      "Arun",
      "Priya",
      "TechCorp",
      "Handcrafted tea sampler kits for corporate appreciation.",
    );
    expect(example.toLowerCase()).toContain("tea sampler");
    expect(example.toLowerCase()).not.toContain("mithai");
    expect(example).toContain("Acme Gifts");
  });
});
