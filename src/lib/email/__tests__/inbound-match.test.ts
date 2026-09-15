import { describe, expect, it } from "vitest";
import {
  collectWatchEmails,
  findWatchLeadForFrom,
  indexWatchLeadsByCampaignMessageId,
  indexWatchLeadsByEmail,
  mergeWatchLeadRows,
  replyContentFromBodies,
  resolveCampaignReplyLead,
} from "@/lib/email/inbound-match";

describe("collectWatchEmails", () => {
  it("includes contact email, recipientEmail, and alternateEmails", () => {
    expect(
      collectWatchEmails({
        contactEmail: "Priya.Sharma@acme.com",
        recipientEmail: "Name <procurement@acme.com>",
        alternateEmails: [
          { email: "prasantmishra@indiasweethouse.in", emailStatus: "unverified" },
          { email: " PRIYA.SHARMA@acme.com ", emailStatus: "verified" },
        ],
      }),
    ).toEqual(["priya.sharma@acme.com", "procurement@acme.com", "prasantmishra@indiasweethouse.in"]);
  });

  it("keeps a lead watchable from recipientEmail when primary email is missing", () => {
    expect(
      collectWatchEmails({
        contactEmail: null,
        recipientEmail: "prasantmishra@indiasweethouse.in",
        alternateEmails: [],
      }),
    ).toEqual(["prasantmishra@indiasweethouse.in"]);
  });
});

describe("watch lead indexing", () => {
  it("matches angle-bracket From headers against alternate emails", () => {
    const leads = mergeWatchLeadRows([
      {
        leadId: "lead-1",
        tenantId: "t1",
        workspaceId: "ws1",
        contactEmail: "ops@acme.com",
        recipientEmail: "buying@acme.com",
        alternateEmails: [{ email: "prasantmishra@indiasweethouse.in", emailStatus: "unverified" }],
        firstSentAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
    const index = indexWatchLeadsByEmail(leads);
    expect(
      findWatchLeadForFrom(["India Sweet House <prasantmishra@indiasweethouse.in>"], index)?.leadId,
    ).toBe("lead-1");
    expect(findWatchLeadForFrom(["buying@acme.com"], index)?.leadId).toBe("lead-1");
  });
});

describe("replyContentFromBodies", () => {
  it("prefers plain text and strips html when text is empty", () => {
    expect(replyContentFromBodies(" Thanks, we will taste this. ", "<p>ignored</p>")).toBe(
      "Thanks, we will taste this.",
    );
    expect(replyContentFromBodies("", "<p>Please send a box.</p>")).toBe("Please send a box.");
  });
});

describe("resolveCampaignReplyLead", () => {
  const rows = mergeWatchLeadRows([
    {
      leadId: "lead-1",
      tenantId: "t1",
      workspaceId: "ws1",
      contactEmail: "pooja@transactfoods.com",
      rfcMessageId: "<camp-1@indiasweethouse.in>",
      emailKind: "initial",
      firstSentAt: new Date("2026-09-12T02:00:00.000Z"),
    },
    {
      leadId: "lead-2",
      tenantId: "t1",
      workspaceId: "ws1",
      contactEmail: "other@example.com",
      rfcMessageId: "<camp-2@indiasweethouse.in>",
      emailKind: "initial",
    },
  ]);
  const byEmail = indexWatchLeadsByEmail(rows);
  const byMessageId = indexWatchLeadsByCampaignMessageId(rows);

  it("accepts a reply that references the campaign Message-ID", () => {
    expect(
      resolveCampaignReplyLead({
        fromAddresses: ["pooja@transactfoods.com"],
        referencedIds: ["<CAMP-1@indiasweethouse.in>"],
        byMessageId,
        byEmail,
      })?.leadId,
    ).toBe("lead-1");
  });

  it("skips From-only mail that is not in the campaign thread", () => {
    expect(
      resolveCampaignReplyLead({
        fromAddresses: ["pooja@transactfoods.com"],
        referencedIds: [],
        byMessageId,
        byEmail,
      }),
    ).toBeUndefined();
  });

  it("does not attach a campaign thread to a different From lead", () => {
    expect(
      resolveCampaignReplyLead({
        fromAddresses: ["other@example.com"],
        referencedIds: ["camp-1@indiasweethouse.in"],
        byMessageId,
        byEmail,
      }),
    ).toBeUndefined();
  });
});
