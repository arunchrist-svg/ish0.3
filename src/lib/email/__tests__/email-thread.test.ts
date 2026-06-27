import { describe, expect, it } from "vitest";
import { buildEmailThread } from "@/lib/email/email-thread";

const baseLead = {
  id: "lead-1",
  status: "outreached",
  lastReplyContent: null,
  threadRootSubject: "Diwali gifting for Acme",
  threadRootMessageId: "<root@test.com>",
} as Parameters<typeof buildEmailThread>[0]["lead"];

describe("buildEmailThread", () => {
  it("uses hidden bar when no drafts and not sent", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "researched" } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [],
      sequenceDrafts: [],
    });

    expect(thread.barMode).toBe("hidden");
    expect(thread.barNodes).toHaveLength(0);
  });

  it("shows draft bar with 3 nodes before send", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "draft_ready" } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [],
      sequenceDrafts: [
        { id: "d1", sequencePosition: 1, subjectA: "Hi", emailBody: "Body 1" },
        { id: "d2", sequencePosition: 2, subjectA: "Re: Hi", emailBody: "Body 2" },
        { id: "d3", sequencePosition: 3, subjectA: "Re: Hi", emailBody: "Body 3" },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
    });

    expect(thread.barMode).toBe("drafts");
    expect(thread.barNodes).toHaveLength(3);
    expect(thread.barNodes[0].label).toBe("Draft 1");
    expect(thread.barNodes[0].state).toBe("current");
  });

  it("shows sequence bar with E1 done and scheduled follow-ups", () => {
    const thread = buildEmailThread({
      lead: baseLead as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [
        {
          id: "s1",
          leadId: "lead-1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          scheduledFor: new Date("2026-06-25T10:00:00Z"),
          sentAt: new Date("2026-06-25T10:00:00Z"),
          subjectSent: "Diwali gifting for Acme",
          bodySnippet: "Hi there",
        },
        {
          id: "s2",
          leadId: "lead-1",
          sequenceDay: 3,
          emailKind: "followup",
          status: "scheduled",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
        {
          id: "s3",
          leadId: "lead-1",
          sequenceDay: 7,
          emailKind: "followup",
          status: "scheduled",
          scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      cadenceDays: [3, 7],
    });

    expect(thread.barMode).toBe("sequence");
    expect(thread.barNodes[0].label).toBe("E1");
    expect(thread.barNodes[0].state).toBe("done");
    expect(thread.barNodes[1].label).toMatch(/^E2/);
    expect(thread.barNodes[1].state).toBe("scheduled");
  });

  it("shows reply bar with draft_reply action when no reply draft", () => {
    const thread = buildEmailThread({
      lead: {
        ...baseLead,
        status: "replied",
        lastReplyContent: "Yes, send a sample please",
      } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [
        {
          id: "s1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          scheduledFor: new Date("2026-06-25T10:00:00Z"),
          sentAt: new Date("2026-06-25T10:00:00Z"),
          subjectSent: "Diwali gifting for Acme",
          bodySnippet: "Hi there",
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      inboundReplyAt: "2026-06-25T14:00:00Z",
    });

    expect(thread.barMode).toBe("reply");
    expect(thread.barNodes).toHaveLength(2);
    expect(thread.barNodes[1].action).toBe("draft_reply");
    expect(thread.phase).toBe("they_replied");
  });

  it("sets drafting_reply when reply draft exists", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "replied" } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [],
      latestOutreach: {
        id: "o1",
        templateVariant: "reply",
        subjectA: "Re: Diwali gifting for Acme",
        emailBody: "Thanks for your note!",
      } as Parameters<typeof buildEmailThread>[0]["latestOutreach"],
      replyDraftSent: false,
    });

    expect(thread.phase).toBe("drafting_reply");
    expect(thread.showComposeZone).toBe(true);
    expect(thread.barNodes[1].kind).toBe("reply_draft");
  });

  it("hides compose zone after reply sent", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "replied" } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [
        {
          id: "r1",
          sequenceDay: -1,
          emailKind: "outbound_reply",
          status: "sent",
          scheduledFor: new Date(),
          sentAt: new Date(),
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      latestOutreach: { id: "o1", templateVariant: "reply" } as Parameters<typeof buildEmailThread>[0]["latestOutreach"],
      replyDraftSent: true,
    });

    expect(thread.phase).toBe("reply_sent");
    expect(thread.showComposeZone).toBe(false);
    expect(thread.nextStep.primaryAction).toBe("Mark tasting sent");
  });
});
