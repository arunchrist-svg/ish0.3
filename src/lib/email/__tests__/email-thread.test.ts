import { describe, expect, it } from "vitest";
import { buildEmailThread } from "@/lib/email/email-thread";
import {
  conversationSide,
  conversationStatusChip,
} from "@/lib/email/conversation-view";

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

  it("shows draft bar with Email 1/2/3 labels before send", () => {
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
    expect(thread.barNodes[0].label).toBe("Email 1");
    expect(thread.barNodes[0].state).toBe("current");
    expect(thread.events.map((e) => e.label)).toEqual(["Email 1", "Email 2", "Email 3"]);
    expect(thread.events.every((e) => e.status === "draft")).toBe(true);
  });

  it("uses Email 1 chosen subject as the thread root before send", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "draft_ready", threadRootSubject: null } as Parameters<
        typeof buildEmailThread
      >[0]["lead"],
      scheduleRows: [],
      sequenceDrafts: [
        {
          id: "d1",
          sequencePosition: 1,
          subjectA: "Hello A",
          subjectB: "Hello B",
          chosenSubjectKey: "B",
          emailBody: "Body 1",
        },
        { id: "d2", sequencePosition: 2, subjectA: "Ignore me", emailBody: "Body 2" },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
    });

    expect(thread.threadRootSubject).toBe("Re: Hello B");
  });

  it("shows sequence bar with Email 1 done and scheduled follow-ups", () => {
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
    expect(thread.barNodes[0].label).toBe("Email 1");
    expect(thread.barNodes[0].state).toBe("done");
    expect(thread.barNodes[0].openedAt).toBeUndefined();
    expect(thread.barNodes[1].label).toBe("Email 2");
    expect(thread.barNodes[1].state).toBe("scheduled");
    expect(thread.events[0].label).toBe("Email 1");
    expect(thread.events[1].label).toBe("Email 2");
  });

  it("marks opened emails on bar nodes and thread events", () => {
    const openedAt = new Date("2026-06-25T12:00:00Z");
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
          openedAt,
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
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      cadenceDays: [3, 7],
    });

    expect(thread.barNodes[0].openedAt).toBe(openedAt.toISOString());
    expect(thread.events[0].status).toBe("opened");
    expect(thread.events[0].openedAt).toBe(openedAt.toISOString());
    expect(conversationStatusChip(thread.events[0]).label).toBe("Opened");
    expect(conversationSide(thread.events[0])).toBe("us");
  });

  it("marks bounced outreach on the matching bar node", () => {
    const bouncedAt = new Date("2026-06-25T12:30:00Z");
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
          bouncedAt,
          bounceType: "Permanent",
          bounceReason: "Mailbox does not exist",
          recipientEmail: "priya.sharma@acme.com",
          subjectSent: "Diwali gifting for Acme",
          bodySnippet: "Hi there",
        },
        {
          id: "s2",
          leadId: "lead-1",
          sequenceDay: 3,
          emailKind: "followup",
          status: "paused",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      cadenceDays: [3, 7],
    });

    expect(thread.barNodes[0].bouncedAt).toBe(bouncedAt.toISOString());
    expect(thread.barNodes[0].recipientEmail).toBe("priya.sharma@acme.com");
    expect(thread.events[0].status).toBe("bounced");
    expect(thread.nextStep.title).toBe("Email bounced");
  });

  it("keeps Email 1-2-3 progress after they reply and puts inbound in events", () => {
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
        {
          id: "s2",
          sequenceDay: 3,
          emailKind: "followup",
          status: "scheduled",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          bodySnippet: "Follow-up body",
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      inboundReplyAt: "2026-06-25T14:00:00Z",
      cadenceDays: [3, 7],
    });

    expect(thread.barMode).toBe("reply");
    expect(thread.barNodes).toHaveLength(3);
    expect(thread.barNodes.map((n) => n.label)).toEqual(["Email 1", "Email 2", "Email 3"]);
    const inbound = thread.events.find((e) => e.kind === "inbound_reply");
    expect(inbound?.label).toBe("They replied");
    expect(inbound?.body).toMatch(/sample please/);
    expect(conversationSide(inbound!)).toBe("them");
    expect(conversationStatusChip(inbound!).label).toBe("They replied");
    expect(thread.phase).toBe("they_replied");
  });

  it("sets drafting_reply when reply draft exists and adds Your reply event", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "replied", lastReplyContent: "Yes" } as Parameters<
        typeof buildEmailThread
      >[0]["lead"],
      scheduleRows: [
        {
          id: "s1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          scheduledFor: new Date("2026-06-25T10:00:00Z"),
          sentAt: new Date("2026-06-25T10:00:00Z"),
          subjectSent: "Hi",
          bodySnippet: "Body",
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      latestOutreach: {
        id: "o1",
        templateVariant: "reply",
        subjectA: "Re: Diwali gifting for Acme",
        emailBody: "Thanks for your note!",
      } as Parameters<typeof buildEmailThread>[0]["latestOutreach"],
      replyDraftSent: false,
      cadenceDays: [3, 7],
    });

    expect(thread.phase).toBe("drafting_reply");
    expect(thread.showComposeZone).toBe(true);
    expect(thread.selectedNodeId).toBe("reply-draft");
    const replyDraft = thread.events.find((e) => e.id === "reply-draft");
    expect(replyDraft?.label).toBe("Your reply");
    expect(replyDraft?.status).toBe("draft");
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
          subjectSent: "Re: Hi",
          bodySnippet: "Thanks!",
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      latestOutreach: { id: "o1", templateVariant: "reply" } as Parameters<typeof buildEmailThread>[0]["latestOutreach"],
      replyDraftSent: true,
    });

    expect(thread.phase).toBe("reply_sent");
    expect(thread.showComposeZone).toBe(false);
    expect(thread.nextStep.primaryAction).toBe("Mark tasting sent");
    const outbound = thread.events.find((e) => e.kind === "outbound_reply");
    expect(outbound?.label).toBe("Your reply");
    expect(conversationStatusChip(outbound!).label).toBe("You replied");
  });
});
