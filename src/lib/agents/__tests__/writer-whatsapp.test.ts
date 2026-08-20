import { describe, expect, it } from "vitest";
import { parseWhatsAppWriterOutput } from "../writer-whatsapp";
import { isEmailOutreachRow, isWhatsAppOutreach, sanitizeWhatsAppCopy } from "@/lib/whatsapp/outreach";
import { shouldAdvanceLeadFromWhatsApp, shouldSetDraftReadyFromWhatsApp } from "@/lib/whatsapp/errors";

describe("WhatsApp writer parse", () => {
  it("reads JSON whatsapp field and strips em dashes", () => {
    const parsed = parseWhatsAppWriterOutput(
      '{"whatsapp":"Hi Priya, we make fresh mithai for your team\\u2014open to a tasting sample this week?"}',
    );
    expect(parsed).toContain("Hi Priya");
    expect(parsed).not.toContain("\u2014");
    expect(parsed).toContain("open to a tasting sample");
  });

  it("recovers a quoted field from messy output", () => {
    const parsed = parseWhatsAppWriterOutput(
      'Here you go:\n{"whatsapp":"Hi Arun, tasting sample for Titan this week?"}\nthanks',
    );
    expect(parsed).toBe("Hi Arun, tasting sample for Titan this week?");
  });
});

describe("WhatsApp outreach isolation", () => {
  it("treats templateVariant whatsapp as a separate channel row", () => {
    expect(isWhatsAppOutreach({ templateVariant: "whatsapp" })).toBe(true);
    expect(isEmailOutreachRow({ templateVariant: "whatsapp" })).toBe(false);
    expect(isEmailOutreachRow({ templateVariant: "gift_sampling" })).toBe(true);
    expect(isEmailOutreachRow({ templateVariant: "reply" })).toBe(true);
  });

  it("does not move email-in-flight leads to draft_ready from WhatsApp", () => {
    expect(shouldSetDraftReadyFromWhatsApp("researched")).toBe(true);
    expect(shouldSetDraftReadyFromWhatsApp("draft_ready")).toBe(false);
    expect(shouldSetDraftReadyFromWhatsApp("approved")).toBe(false);
    expect(shouldSetDraftReadyFromWhatsApp("outreached")).toBe(false);
    expect(shouldAdvanceLeadFromWhatsApp("draft_ready")).toBe(true);
    expect(shouldAdvanceLeadFromWhatsApp("outreached")).toBe(false);
    expect(shouldAdvanceLeadFromWhatsApp("replied")).toBe(false);
  });

  it("sanitizes copy without changing email drafts", () => {
    expect(sanitizeWhatsAppCopy("Hi  \n\n\nPriya")).toBe("Hi\n\nPriya");
  });
});
