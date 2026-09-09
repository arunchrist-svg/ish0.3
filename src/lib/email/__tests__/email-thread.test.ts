import { describe, expect, it } from "vitest";
import {
  buildEmailThread,
  buildDraftsEmailThread,
  effectiveScheduleStep,
  isEmail1SentInThread,
  pendingFollowUpScheduleIdFromNode,
} from "@/lib/email/email-thread";
import {
  conversationSide,
  conversationStatusChip,
  shouldShowConversationTimeline,
  shouldShowSentOutboundPreview,
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
    expect(thread.barNodes[1].label).toBe("Email 2 (+3d)");
    expect(thread.barNodes[2].label).toBe("Email 3 (+7d)");
    expect(thread.barNodes[0].state).toBe("current");
    expect(thread.events.map((e) => e.label)).toEqual(["Email 1", "Email 2", "Email 3"]);
    expect(thread.events.every((e) => e.status === "draft")).toBe(true);
  });

  it("adds If Opened to the draft rail without treating it as Email 4", () => {
    const thread = buildEmailThread({
      lead: { ...baseLead, status: "draft_ready" } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [],
      sequenceDrafts: [
        { id: "d1", sequencePosition: 1, subjectA: "Hi", emailBody: "Body 1" },
        { id: "d2", sequencePosition: 2, subjectA: "Re: Hi", emailBody: "Body 2" },
        { id: "d3", sequencePosition: 3, subjectA: "Re: Hi", emailBody: "Body 3" },
        {
          id: "d5",
          sequencePosition: 5,
          templateVariant: "catalog_on_open",
          subjectA: "festive gifting for Acme",
          emailBody: "2026 gemstone collection",
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
    });

    expect(thread.barNodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2 (+3d)",
      "Email 3 (+7d)",
      "If Opened",
    ]);
    expect(thread.barNodes[3].id).toBe("if-opened");
    expect(thread.barNodes[3].outreachId).toBe("d5");
    expect(thread.events.map((e) => e.label)).toEqual(["Email 1", "Email 2", "Email 3"]);
  });

  it("buildDraftsEmailThread rebuilds the compose rail for optimistic client updates", () => {
    const thread = buildDraftsEmailThread(
      [
        { id: "d1", sequencePosition: 1, subjectA: "Hi", emailBody: "Body 1" },
        { id: "d2", sequencePosition: 2, subjectA: "Re: Hi", emailBody: "Body 2" },
        { id: "d3", sequencePosition: 3, subjectA: "Re: Hi", emailBody: "Body 3" },
        {
          id: "d5",
          sequencePosition: 5,
          templateVariant: "catalog_on_open",
          subjectA: "festive",
          emailBody: "2026 gemstone collection",
        },
      ],
      {
        previous: {
          phase: "compose",
          nextAction: "compose",
          barMode: "hidden",
          barNodes: [],
          events: [],
          showComposeZone: true,
        },
      },
    );

    expect(thread?.barMode).toBe("drafts");
    expect(thread?.barNodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2 (+3d)",
      "Email 3 (+7d)",
      "If Opened",
    ]);
    expect(thread?.selectedNodeId).toBe("draft-1");
  });

  it("buildDraftsEmailThread refreshes thread root when Email 1 subject changes", () => {
    const previous = buildDraftsEmailThread([
      { id: "d1", sequencePosition: 1, subjectA: "Old subject", emailBody: "Body 1" },
      { id: "d2", sequencePosition: 2, subjectA: "Re: Old subject", emailBody: "Body 2" },
    ]);
    expect(previous?.threadRootSubject).toBe("Old subject");

    const next = buildDraftsEmailThread(
      [
        { id: "d1", sequencePosition: 1, subjectA: "New subject", emailBody: "Body 1" },
        { id: "d2", sequencePosition: 2, subjectA: "Re: Old subject", emailBody: "Body 2" },
      ],
      { previous },
    );

    expect(next?.threadRootSubject).toBe("New subject");
  });

  it("shows If Opened as scheduled on the sequence bar", () => {
    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
          openedAt: new Date("2026-06-25T12:00:00Z"),
          subjectSent: "Hi",
          bodySnippet: "Hi there",
        },
        {
          id: "s2",
          leadId: "lead-1",
          sequenceDay: 3,
          emailKind: "followup",
          status: "scheduled",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          bodySnippet: "Short sample",
        },
        {
          id: "s5",
          leadId: "lead-1",
          sequenceDay: 5,
          emailKind: "catalog_on_open",
          status: "scheduled",
          scheduledFor,
          draftLeadOutreachId: "d5",
        },
      ] as unknown as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      sequenceDrafts: [
        {
          id: "d5",
          sequencePosition: 5,
          templateVariant: "catalog_on_open",
          subjectA: "festive gifting for Acme",
          emailBody: "2026 gemstone collection",
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
      cadenceDays: [3, 7],
    });

    expect(thread.barNodes[1].label).toBe("Email 2");
    expect(thread.barNodes[1].state).toBe("scheduled");
    expect(thread.barNodes[3].id).toBe("if-opened");
    expect(thread.barNodes[3].label).toBe("If Opened");
    expect(thread.barNodes[3].state).toBe("scheduled");
    expect(thread.events.some((e) => e.label === "If Opened" && e.status === "scheduled")).toBe(true);
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
    // Two-sided conversation stack stays gated until a reply.
    expect(shouldShowConversationTimeline(thread)).toBe(false);
    // Email tab still shows sent Email 1 via showOutboundHistory when that step is selected.
    expect(
      shouldShowSentOutboundPreview({
        composeEditorVisible: false,
        selectedNodeKind: "sent",
        phase: "awaiting_reply",
      }),
    ).toBe(true);
    expect(
      shouldShowSentOutboundPreview({
        composeEditorVisible: true,
        selectedNodeKind: "scheduled",
        phase: "awaiting_reply",
      }),
    ).toBe(false);
  });

  it("does not show Email 1 body on a scheduled Email 2 that reuses Email 1 approvalId", () => {
    const thread = buildEmailThread({
      lead: baseLead as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [
        {
          id: "s1",
          leadId: "lead-1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          approvalId: "appr-e1",
          scheduledFor: new Date("2026-09-07T17:36:00Z"),
          sentAt: new Date("2026-09-07T17:36:00Z"),
          subjectSent: "A festive sample for Genesis Technologies",
          bodySnippet: "Hi Seetanjali,\n\nEmail 1 body about a sample box.",
        },
        {
          id: "s2",
          leadId: "lead-1",
          sequenceDay: 3,
          emailKind: "followup",
          status: "scheduled",
          approvalId: "appr-e1",
          draftLeadOutreachId: "d2",
          scheduledFor: new Date("2026-09-11T02:00:00Z"),
        },
      ] as unknown as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      sequenceDrafts: [
        {
          id: "d1",
          sequencePosition: 1,
          subjectA: "A festive sample for Genesis Technologies",
          emailBody: "Hi Seetanjali,\n\nEmail 1 body about a sample box.",
        },
        {
          id: "d2",
          sequencePosition: 2,
          subjectA: "Re: A festive sample for Genesis Technologies",
          emailBody: "Hi Seetanjali,\n\nEmail 2 short urgency follow-up.",
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
      outreachBodiesByApprovalId: {
        "appr-e1": "Hi Seetanjali,\n\nEmail 1 body about a sample box.",
      },
      cadenceDays: [3, 7],
    });

    const e1 = thread.events.find((e) => e.label === "Email 1");
    const e2 = thread.events.find((e) => e.label === "Email 2");
    expect(e1?.body).toContain("Email 1 body");
    expect(e1?.subject).toBe("A festive sample for Genesis Technologies");
    expect(e2?.status).toBe("scheduled");
    expect(e2?.body).toContain("Email 2 short urgency");
    expect(e2?.body).not.toContain("Email 1 body");
    expect(e2?.subject).toBe("Re: A festive sample for Genesis Technologies");
    expect(thread.barNodes[1].body).toContain("Email 2 short urgency");
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
    expect(thread.nextStep?.title).toBe("Email bounced");
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
    expect(thread.barNodes[1].state).toBe("skipped");
    expect(thread.barNodes[2].state).toBe("skipped");
    const inbound = thread.events.find((e) => e.kind === "inbound_reply");
    expect(inbound?.label).toBe("Their reply");
    expect(inbound?.body).toMatch(/sample please/);
    expect(conversationSide(inbound!)).toBe("them");
    expect(conversationStatusChip(inbound!).label).toBe("Their reply");
    expect(thread.phase).toBe("they_replied");
    expect(shouldShowConversationTimeline(thread)).toBe(true);
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
    expect(thread.selectedNodeId).toBe("if-replied");
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
    expect(thread.nextStep?.primaryAction).toBe("Mark tasting sent");
    const outbound = thread.events.find((e) => e.kind === "outbound_reply");
    expect(outbound?.label).toBe("Your reply");
    expect(conversationStatusChip(outbound!).label).toBe("Your reply");
  });

  it("relabels a day-0 breakup send as Email 3 when approval draft is position 3", () => {
    expect(
      effectiveScheduleStep({
        sequenceDay: 0,
        emailKind: "initial",
        linkedDraft: { sequencePosition: 3, templateVariant: "final_reminder" },
        cadenceDays: [3, 7],
      }),
    ).toMatchObject({
      sequenceDay: 7,
      emailKind: "followup",
      label: "Email 3",
      recoveredFromDraft: true,
    });

    const thread = buildEmailThread({
      lead: {
        ...baseLead,
        threadRootSubject: "Re: A festive sample for Genesis Technologies",
      } as Parameters<typeof buildEmailThread>[0]["lead"],
      scheduleRows: [
        {
          id: "s-breakup",
          leadId: "lead-1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          approvalId: "appr-e3",
          draftLeadOutreachId: null,
          scheduledFor: new Date("2026-09-07T12:06:00Z"),
          sentAt: new Date("2026-09-07T12:06:00Z"),
          openedAt: new Date("2026-09-08T04:42:00Z"),
          subjectSent: "Re: A festive sample for Genesis Technologies",
          bodySnippet:
            "Hi Seetanjali,\n\nI don't want to keep filling your inbox, so I'll leave it here.",
        },
        {
          id: "s2",
          leadId: "lead-1",
          sequenceDay: 3,
          emailKind: "followup",
          status: "cancelled",
          draftLeadOutreachId: "d2",
          scheduledFor: new Date("2026-09-10T20:30:00Z"),
        },
        {
          id: "s3",
          leadId: "lead-1",
          sequenceDay: 7,
          emailKind: "followup",
          status: "scheduled",
          draftLeadOutreachId: "d3",
          scheduledFor: new Date("2026-09-14T20:30:00Z"),
        },
      ] as unknown as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      sequenceDrafts: [
        {
          id: "d1",
          sequencePosition: 1,
          templateVariant: "gift_sampling",
          subjectA: "A festive sample for Genesis Technologies",
          emailBody: "Hi Seetanjali,\n\nEmail 1 intro about a sample box.",
        },
        {
          id: "d2",
          sequencePosition: 2,
          templateVariant: "follow_up",
          subjectA: "Re: A festive sample for Genesis",
          emailBody: "Hi Seetanjali,\n\nEmail 2 follow-up.",
        },
        {
          id: "d3",
          sequencePosition: 3,
          templateVariant: "final_reminder",
          subjectA: "Re: A festive sample for Genesis Technologies",
          emailBody:
            "Hi Seetanjali,\n\nI don't want to keep filling your inbox, so I'll leave it here.",
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
      draftIdByApprovalId: { "appr-e3": "d3" },
      cadenceDays: [3, 7],
    });

    const sentBreakup = thread.events.find((e) => e.id === "s-breakup");
    expect(sentBreakup?.label).toBe("Email 3");
    expect(sentBreakup?.sequenceDay).toBe(7);
    expect(sentBreakup?.body).toContain("leave it here");

    expect(thread.barNodes[0].label).toBe("Email 1");
    expect(thread.barNodes[0].state).toBe("upcoming");
    expect(thread.barNodes[0].kind).toBe("draft");
    expect(thread.barNodes[0].body ?? "").toContain("Email 1 intro");
    expect(thread.barNodes[0].body ?? "").not.toContain("leave it here");
    expect(thread.barNodes[2].label).toBe("Email 3");
    expect(thread.barNodes[2].state).toBe("done");
    expect(thread.barNodes[2].body).toContain("leave it here");

    const email1DraftEvent = thread.events.find((e) => e.label === "Email 1" && e.status === "draft");
    expect(email1DraftEvent?.body).toContain("Email 1 intro");
    expect(isEmail1SentInThread(thread)).toBe(false);
  });
});

describe("pendingFollowUpScheduleIdFromNode", () => {
  it("returns a live scheduled follow-up id and ignores skipped or sent nodes", () => {
    expect(
      pendingFollowUpScheduleIdFromNode({
        scheduleId: "s2",
        kind: "scheduled",
        state: "scheduled",
      }),
    ).toBe("s2");
    expect(
      pendingFollowUpScheduleIdFromNode({
        scheduleId: "s-open",
        kind: "draft",
        state: "scheduled",
      }),
    ).toBe("s-open");
    expect(
      pendingFollowUpScheduleIdFromNode({
        scheduleId: "s3",
        kind: "sent",
        state: "done",
      }),
    ).toBeUndefined();
    expect(
      pendingFollowUpScheduleIdFromNode({
        scheduleId: "s-cancelled",
        kind: "scheduled",
        state: "skipped",
      }),
    ).toBeUndefined();
  });
});
