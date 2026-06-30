import { describe, expect, it } from "vitest";
import { getReplyCtaInstruction } from "@/lib/email/outreach-templates";

describe("getReplyCtaInstruction", () => {
  it("asks for address after affirmative gift_sampling reply", () => {
    const instruction = getReplyCtaInstruction("gift_sampling", "affirmative");
    expect(instruction).toMatch(/address/i);
    expect(instruction).toMatch(/Do NOT re-ask/i);
  });

  it("does not ask for address on negative reply", () => {
    const instruction = getReplyCtaInstruction("gift_sampling", "negative");
    expect(instruction).toMatch(/not interested|declined/i);
    expect(instruction).not.toMatch(/Do NOT re-ask/i);
  });
});
