import { describe, expect, it } from "vitest";
import {
  applyWriterDraft,
  applyWriterSequence,
  mergeLeadOutreachFromServer,
  upsertDraftInSequence,
  type LeadDraftState,
} from "@/lib/email/apply-writer-draft";

function draft(partial: { id: string; sequencePosition?: number; templateVariant?: string; emailBody?: string }) {
  return {
    id: partial.id,
    sequencePosition: partial.sequencePosition,
    templateVariant: partial.templateVariant,
    emailBody: partial.emailBody,
  };
}

type Draft = ReturnType<typeof draft>;

describe("apply writer draft to lead state", () => {
  it("inserts a new sequence step and keeps Email 1 as the active outreach", () => {
    const lead = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      outreachSequence: [draft({ id: "e1", sequencePosition: 1, emailBody: "one" })],
    };
    const e2 = draft({ id: "e2", sequencePosition: 2, emailBody: "two" });
    const next = applyWriterDraft(lead, e2);
    expect(next.outreach?.id).toBe("e1");
    expect(next.outreachSequence?.map((d) => d.id)).toEqual(["e1", "e2"]);
  });

  it("replaces an existing draft at the same sequence position", () => {
    const rows = [
      draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      draft({ id: "e2-old", sequencePosition: 2, emailBody: "old two" }),
    ];
    const next = upsertDraftInSequence(rows, draft({ id: "e2-new", sequencePosition: 2, emailBody: "new two" }));
    expect(next.map((d) => d.id)).toEqual(["e1", "e2-new"]);
    expect(next[1].emailBody).toBe("new two");
  });

  it("applies a full Writer sequence onto the lead", () => {
    const lead: LeadDraftState<Draft> = { status: "researched" };
    const drafts = [
      draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      draft({ id: "e2", sequencePosition: 2, emailBody: "two" }),
      draft({ id: "e3", sequencePosition: 3, emailBody: "three" }),
    ];
    const next = applyWriterSequence(lead, drafts);
    expect(next.status).toBe("draft_ready");
    expect(next.outreach?.id).toBe("e1");
    expect(next.outreachSequence).toHaveLength(3);
    expect(next.emailThread?.barMode).toBe("drafts");
    expect(next.emailThread?.barNodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2 (+3d)",
      "Email 3 (+7d)",
    ]);
  });

  it("rebuilds the drafts rail when applying a catalog If Opened draft", () => {
    const lead: LeadDraftState<Draft> = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      outreachSequence: [
        draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
        draft({ id: "e2", sequencePosition: 2, emailBody: "two" }),
        draft({ id: "e3", sequencePosition: 3, emailBody: "three" }),
      ],
      emailThread: {
        phase: "compose",
        nextAction: "compose",
        barMode: "hidden",
        barNodes: [],
        events: [],
        showComposeZone: true,
      },
    };
    const catalog = draft({
      id: "e5",
      sequencePosition: 5,
      templateVariant: "catalog_on_open",
      emailBody: "2026 gemstone collection",
    });
    const next = applyWriterDraft(lead, catalog);
    expect(next.emailThread?.barMode).toBe("drafts");
    expect(next.emailThread?.barNodes.map((n) => n.label)).toEqual([
      "Email 1",
      "Email 2 (+3d)",
      "Email 3 (+7d)",
      "If Opened",
    ]);
  });

  it("keeps locally generated drafts when the server refresh has not caught up", () => {
    const prev: LeadDraftState<Draft> = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      outreachSequence: [
        draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
        draft({ id: "e2", sequencePosition: 2, emailBody: "two" }),
      ],
      emailThread: {
        phase: "compose",
        nextAction: "compose",
        barMode: "drafts",
        barNodes: [
          { id: "draft-1", label: "Email 1", state: "current", kind: "draft" },
          { id: "draft-2", label: "Email 2 (+3d)", state: "upcoming", kind: "draft" },
        ],
        events: [],
        showComposeZone: true,
      },
    };
    const incoming: LeadDraftState<Draft> = {
      status: "draft_ready",
      emailThread: {
        phase: "compose",
        nextAction: "compose",
        barMode: "hidden",
        barNodes: [],
        events: [],
        showComposeZone: true,
      },
    };
    const next = mergeLeadOutreachFromServer(prev, incoming);
    expect(next.outreachSequence).toHaveLength(2);
    expect(next.outreach?.id).toBe("e1");
    expect(next.emailThread?.barMode).toBe("drafts");
    expect(next.emailThread?.barNodes.length).toBeGreaterThan(0);
  });

  it("drops local drafts when the server reset the lead back to researched", () => {
    const prev: LeadDraftState<Draft> = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
      outreachSequence: [
        draft({ id: "e1", sequencePosition: 1, emailBody: "one" }),
        draft({ id: "e2", sequencePosition: 2, emailBody: "two" }),
      ],
    };
    const incoming: LeadDraftState<Draft> = { status: "researched" };
    const next = mergeLeadOutreachFromServer(prev, incoming);
    expect(next.outreach).toBeUndefined();
    expect(next.outreachSequence).toBeUndefined();
  });

  it("prefers the local copy of a draft the server also returned", () => {
    const prev: LeadDraftState<Draft> = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "edited" }),
      outreachSequence: [draft({ id: "e1", sequencePosition: 1, emailBody: "edited" })],
    };
    const incoming: LeadDraftState<Draft> = {
      status: "draft_ready",
      outreach: draft({ id: "e1", sequencePosition: 1, emailBody: "stale" }),
      outreachSequence: [draft({ id: "e1", sequencePosition: 1, emailBody: "stale" })],
    };
    const next = mergeLeadOutreachFromServer(prev, incoming);
    expect(next.outreach?.emailBody).toBe("edited");
    expect(next.outreachSequence?.[0].emailBody).toBe("edited");
  });
});
