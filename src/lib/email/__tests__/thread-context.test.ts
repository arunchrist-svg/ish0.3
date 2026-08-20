import { describe, expect, it } from "vitest";
import { resolveOutboundSubject } from "@/lib/email/thread-context";

describe("resolveOutboundSubject", () => {
  it("keeps Email 1 subject unchanged", () => {
    expect(
      resolveOutboundSubject({
        isReplySend: false,
        rootSubject: null,
        fallbackSubject: "Diwali gifting for Acme",
      }),
    ).toBe("Diwali gifting for Acme");
  });

  it("uses the thread root for follow-ups, not a per-draft subject", () => {
    expect(
      resolveOutboundSubject({
        isReplySend: false,
        isFollowUp: true,
        rootSubject: "Diwali gifting for Acme",
        fallbackSubject: "A different follow-up subject",
      }),
    ).toBe("Re: Diwali gifting for Acme");
  });

  it("uses the thread root for inbound replies", () => {
    expect(
      resolveOutboundSubject({
        isReplySend: true,
        rootSubject: "Re: Diwali gifting for Acme",
        fallbackSubject: "Reply option B",
      }),
    ).toBe("Re: Diwali gifting for Acme");
  });
});
