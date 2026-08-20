import { describe, expect, it } from "vitest";
import {
  buildWhatsAppClickUrl,
  formatWhatsAppDisplay,
  toWhatsAppE164,
  toWhatsAppUserId,
} from "../click-url";

describe("WhatsApp click URL", () => {
  it("builds wa.me with 91 prefix and encoded text", () => {
    expect(toWhatsAppUserId("+91 98450-12345")).toBe("919845012345");
    expect(toWhatsAppE164("09845012345")).toBe("+919845012345");
    expect(formatWhatsAppDisplay("9845012345")).toBe("+91 98450 12345");
    expect(buildWhatsAppClickUrl("9845012345", "Hi Priya\nOpen to a tasting sample?")).toBe(
      "https://wa.me/919845012345?text=Hi%20Priya%0AOpen%20to%20a%20tasting%20sample%3F",
    );
  });

  it("rejects invalid and empty inputs", () => {
    expect(toWhatsAppUserId("123")).toBeNull();
    expect(toWhatsAppUserId("5845012345")).toBeNull();
    expect(() => buildWhatsAppClickUrl("123", "Hi")).toThrow("Invalid mobile number");
    expect(() => buildWhatsAppClickUrl("9845012345", "   ")).toThrow("WhatsApp message is empty");
  });
});
