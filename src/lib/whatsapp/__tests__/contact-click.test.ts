import { describe, expect, it } from "vitest";
import { buildContactWhatsAppMessage, contactFirstName } from "../contact-click";

describe("contact WhatsApp click message", () => {
  it("uses first name and company", () => {
    expect(contactFirstName("Priya Sharma", null)).toBe("Priya");
    const text = buildContactWhatsAppMessage({
      name: "Priya Sharma",
      company: "TVS Motor",
    });
    expect(text).toContain("Hi Priya,");
    expect(text).toContain("TVS Motor");
    expect(text).toContain("tasting sample");
    expect(text).not.toContain("\u2014");
  });

  it("still works without a company", () => {
    const text = buildContactWhatsAppMessage({ name: "Ravi", company: "" });
    expect(text).toContain("Hi Ravi,");
    expect(text).not.toContain("teams like");
  });
});
