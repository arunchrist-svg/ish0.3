import { describe, expect, it } from "vitest";
import { buildEmailThread } from "@/lib/email/email-thread";
import { buildSequenceFlow } from "@/lib/email/sequence-flow";
import { buildIshFestiveCatalogParagraphs } from "@/lib/email/ish-festive-catalog";

const baseLead = {
  id: "lead-1",
  status: "outreached",
  lastReplyContent: null,
  threadRootSubject: "Diwali gifting for Acme",
  threadRootMessageId: "<root@test.com>",
} as Parameters<typeof buildEmailThread>[0]["lead"];

describe("buildSequenceFlow", () => {
  it("shows the planned sequence when there is no thread", () => {
    const flow = buildSequenceFlow(undefined);
    expect(flow.mode).toBe("plan");
    expect(flow.nodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2",
      "Email 3",
      "If Opened",
    ]);
    expect(flow.nodes.some((n) => n.slot === "replied")).toBe(false);
    expect(flow.nodes[1].cadenceLabel).toBe("+3d");
    expect(flow.nodes[2].cadenceLabel).toBe("+7d");
    expect(flow.level2Visible).toBe(false);
    expect(flow.catalogActive).toBe(false);
    expect(flow.replyActive).toBe(false);
  });

  it("uses draft bar as a planned sequence", () => {
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
          emailBody: buildIshFestiveCatalogParagraphs("India Sweet House"),
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
    });
    const flow = buildSequenceFlow(thread);
    expect(flow.mode).toBe("plan");
    expect(flow.level2Visible).toBe(false);
    expect(flow.nodes[0].state).toBe("current");
    expect(flow.nodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2",
      "Email 3",
      "If Opened",
    ]);
    expect(flow.nodes[3].id).toBe("if-opened");
    expect(flow.nodes.some((n) => n.id === "if-replied")).toBe(false);
  });

  it("waits with the short draft when Email 1 is sent and not opened", () => {
    const thread = buildEmailThread({
      lead: baseLead,
      scheduleRows: [
        {
          id: "s1",
          leadId: "lead-1",
          sequenceDay: 0,
          emailKind: "initial",
          status: "sent",
          scheduledFor: new Date("2026-06-25T10:00:00Z"),
          sentAt: new Date("2026-06-25T10:00:00Z"),
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
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      cadenceDays: [3, 7],
    });
    const flow = buildSequenceFlow(thread);
    expect(flow.mode).toBe("waiting");
    expect(flow.level2Visible).toBe(false);
    expect(flow.catalogQueuedFor).toBeNull();
  });

  it("schedules If Opened after Email 1 is opened without rewriting Email 2", () => {
    const catalog = buildIshFestiveCatalogParagraphs("India Sweet House");
    const ifOpenedAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const thread = buildEmailThread({
      lead: baseLead,
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
          scheduledFor: ifOpenedAt,
          draftLeadOutreachId: "d5",
        },
      ] as unknown as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      sequenceDrafts: [
        {
          id: "d5",
          sequencePosition: 5,
          templateVariant: "catalog_on_open",
          subjectA: "festive gifting for Acme",
          emailBody: catalog,
        },
      ] as Parameters<typeof buildEmailThread>[0]["sequenceDrafts"],
      cadenceDays: [3, 7],
    });
    expect(thread.barNodes[1].state).toBe("scheduled");
    expect(thread.barNodes[1].body).toContain("Short sample");
    expect(thread.barNodes[3].id).toBe("if-opened");
    expect(thread.barNodes[3].state).toBe("scheduled");
    const flow = buildSequenceFlow(thread);
    expect(flow.mode).toBe("catalog");
    expect(flow.level2Visible).toBe(true);
    expect(flow.catalogActive).toBe(true);
    expect(flow.catalogQueuedFor).toBeNull();
    expect(flow.nodes[0].opened).toBe(true);
    expect(flow.nodes[1].variant).toBe("sample");
    expect(flow.nodes[3].state).toBe("scheduled");
    expect(flow.nodes[3].opened).toBe(true);
    expect(flow.nodes[3].cadenceLabel).toBe("Queued");
    expect(flow.nodes.some((n) => n.slot === "replied")).toBe(false);
  });

  it("marks later emails skipped after they reply", () => {
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
          subjectSent: "Hi",
          bodySnippet: "Hi there",
        },
        {
          id: "s2",
          sequenceDay: 3,
          emailKind: "followup",
          status: "cancelled",
          scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          bodySnippet: "Follow-up body",
        },
      ] as Parameters<typeof buildEmailThread>[0]["scheduleRows"],
      inboundReplyAt: "2026-06-25T14:00:00Z",
      cadenceDays: [3, 7],
    });
    expect(thread.barNodes[1].state).toBe("skipped");
    expect(thread.barNodes[2].state).toBe("skipped");
    const flow = buildSequenceFlow(thread);
    expect(flow.mode).toBe("replied");
    expect(flow.level2Visible).toBe(true);
    expect(flow.replyActive).toBe(true);
    expect(flow.nodes[1].state).toBe("skipped");
    const replyNode = flow.nodes.find((n) => n.id === "if-replied");
    expect(replyNode).toBeDefined();
    expect(replyNode?.label).toBe("Reply");
    expect(replyNode?.state).toBe("upcoming");
    expect(replyNode?.cadenceLabel).toBe("Write");
  });
});
