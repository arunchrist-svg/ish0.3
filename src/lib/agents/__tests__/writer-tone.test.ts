import { describe, expect, it } from "vitest";
import { getWriterFewShotExample } from "@/lib/agents/writer-tone";

describe("getWriterFewShotExample", () => {
  it("uses product summary for appliances pack, not mithai", () => {
    const example = getWriterFewShotExample(
      "prestige",
      "Prestige",
      "Arun",
      "Priya",
      "TechCorp",
      "Mixer grinders and kitchen bundles for corporate rewards.",
      "gifting-appliances",
    );
    expect(example.toLowerCase()).toContain("mixer");
    expect(example.toLowerCase()).not.toContain("mithai");
  });

  it("uses product summary for sweets pack when provided", () => {
    const example = getWriterFewShotExample(
      "ish",
      "India Sweet House",
      "Arun",
      "Priya",
      "TechCorp",
      "Premium mithai and dry-fruit hampers.",
      "gifting-sweets",
    );
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
      "general",
    );
    expect(example.toLowerCase()).toContain("tea sampler");
    expect(example.toLowerCase()).not.toContain("mithai");
    expect(example).toContain("Acme Gifts");
  });
});
