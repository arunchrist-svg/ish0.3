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
    expect(example.toLowerCase()).toContain("forgotten by the next day");
    expect(example.toLowerCase()).toContain("crafted fresh every morning with organic milk, ghee, and khova from our own farm");
    expect(example.toLowerCase()).toContain("sample box to techcorp as our treat");
    expect(example.toLowerCase()).toContain("tasting is believing");
    expect(example.toLowerCase()).toContain("we never add preservatives or chemicals");
    expect(example).toMatch(/^Best,$/m);
    expect(example.toLowerCase()).toContain("employees and clients");
    expect(example.toLowerCase()).toContain("organic milk");
    expect(example.toLowerCase()).toContain("own farm");
    expect(example).toMatch(/Sample box for festive tasting/i);
    expect(example).toMatch(/farm-fresh mithai/);
    expect(example).toMatch(/never add preservatives or chemicals/);
    expect(example.toLowerCase()).not.toContain("offers traditional");
    expect(example).not.toMatch(/No worries/i);
  });

  it("uses store opening, birthday, and pantry few-shots without Diwali subjects", () => {
    const opening = getWriterFewShotExample(
      "ish",
      "India Sweet House",
      "Arun",
      "Priya",
      "TechCorp",
      "Premium mithai",
      "gifting-sweets",
      "store_opening",
    );
    expect(opening).toMatch(/store coming up|store launch/i);
    expect(opening.toLowerCase()).not.toMatch(/diwali|festive tasting/);

    const birthday = getWriterFewShotExample(
      "ish",
      "India Sweet House",
      "Arun",
      "Priya",
      "TechCorp",
      "Premium mithai",
      "gifting-sweets",
      "birthday",
    );
    expect(birthday).toMatch(/monthly birthdays/i);
    expect(birthday.toLowerCase()).not.toMatch(/diwali|festive tasting/);

    const pantry = getWriterFewShotExample(
      "ish",
      "India Sweet House",
      "Arun",
      "Priya",
      "TechCorp",
      "Premium mithai",
      "gifting-sweets",
      "pantry",
    );
    expect(pantry).toMatch(/office pantry/i);
    expect(pantry.toLowerCase()).not.toContain("diwali");
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
