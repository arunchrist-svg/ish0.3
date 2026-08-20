import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  outreachFindFirst: vi.fn(),
  outreachFindMany: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  runWriter: vi.fn(),
  deleteLeadOutreachWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      leads: { findFirst: mocks.leadFindFirst },
      leadOutreach: { findFirst: mocks.outreachFindFirst, findMany: mocks.outreachFindMany },
    },
    update: () => ({ set: () => ({ where: mocks.update }) }),
    insert: () => ({ values: mocks.insert }),
  },
  leadOutreach: { id: "id", leadId: "leadId", sequencePosition: "sequencePosition" },
  leads: { id: "id", status: "status" },
  yieldFunnel: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/agents/writer", () => ({
  runWriter: mocks.runWriter,
  resolveWriterMode: (mode?: string | null) => (mode === "ai" ? "ai" : "standard"),
}));
vi.mock("@/lib/outreach/delete-lead-outreach", () => ({
  deleteLeadOutreachWhere: mocks.deleteLeadOutreachWhere,
}));

import { regenerateSequenceStep, runWriterSequence } from "@/lib/agents/writer-sequence";

const E1 = `Hi Vijetha,

Festival week on a Hosur line is less about a catalogue box and more about whether shop-floor and office both get something they'll remember.

Don't take our word for it. Let us send Acme Auto a taste first.

Want a sampler box on your desk this week?

Srilaksha
Partnerships, India Sweet House`;

const E2_DISTINCT = `Hi Vijetha,

Diwali gifting sneaks up faster than expected, and tasting slots fill before festival week.

Should I send Acme Auto a sampler this week?

Srilaksha
Partnerships, India Sweet House`;

const E3 = `Hi Vijetha,

I don't want to keep filling your inbox, so I'll leave it here. If festive gifting for Acme Auto comes up this season, the door is open.

I won't email further, but a tasting box stays available if you want to reach out.

Wishing you a happy festival season.

Srilaksha
Partnerships, India Sweet House`;

describe("runWriterSequence similarity gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leadFindFirst.mockResolvedValue({ id: "lead-1" });
    mocks.deleteLeadOutreachWhere.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(undefined);
    mocks.insert.mockResolvedValue(undefined);
  });

  it("regenerates E2 once when it clones E1", async () => {
    mocks.runWriter.mockImplementation(async (_leadId: string, opts: { sequencePosition?: number; forceNewAngle?: boolean }) => {
      if (opts.forceNewAngle) return "id2b";
      if (opts.sequencePosition === 1) return "id1";
      if (opts.sequencePosition === 2) return "id2";
      return "id3";
    });
    mocks.outreachFindFirst
      .mockResolvedValueOnce({
        id: "id1",
        emailBody: E1,
        subjectA: "Send happiness this Diwali, Vijetha",
        sequencePosition: 1,
      })
      .mockResolvedValueOnce({ id: "id2", emailBody: E1, sequencePosition: 2 })
      .mockResolvedValueOnce({ id: "id3", emailBody: E3, sequencePosition: 3 });
    mocks.outreachFindMany.mockResolvedValue([
      {
        id: "id1",
        emailBody: E1,
        subjectA: "Send happiness this Diwali, Vijetha",
        sequencePosition: 1,
      },
      { id: "id2", emailBody: E1, sequencePosition: 2 },
    ]);

    const ids = await runWriterSequence("lead-1");

    expect(ids).toEqual(["id1", "id2b", "id3"]);
    expect(mocks.runWriter).toHaveBeenCalledTimes(4);
    expect(mocks.runWriter.mock.calls.map((c) => c[1])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sequencePosition: 2,
          forceNewAngle: true,
          originalEmailBody: E1,
          originalEmailSubject: "Send happiness this Diwali, Vijetha",
        }),
      ]),
    );
  });

  it("does not regenerate when E2 and E3 are distinct", async () => {
    mocks.runWriter.mockResolvedValueOnce("id1").mockResolvedValueOnce("id2").mockResolvedValueOnce("id3");
    mocks.outreachFindFirst
      .mockResolvedValueOnce({
        id: "id1",
        emailBody: E1,
        subjectA: "Send happiness this Diwali, Vijetha",
        sequencePosition: 1,
      })
      .mockResolvedValueOnce({ id: "id2", emailBody: E2_DISTINCT, sequencePosition: 2 })
      .mockResolvedValueOnce({ id: "id3", emailBody: E3, sequencePosition: 3 });

    const ids = await runWriterSequence("lead-1");

    expect(ids).toEqual(["id1", "id2", "id3"]);
    expect(mocks.runWriter).toHaveBeenCalledTimes(3);
    expect(mocks.outreachFindMany).not.toHaveBeenCalled();
  });

  it("forwards writerMode to every sequence step", async () => {
    mocks.runWriter.mockResolvedValueOnce("id1").mockResolvedValueOnce("id2").mockResolvedValueOnce("id3");
    mocks.outreachFindFirst
      .mockResolvedValueOnce({
        id: "id1",
        emailBody: E1,
        subjectA: "Send happiness this Diwali, Vijetha",
        sequencePosition: 1,
      })
      .mockResolvedValueOnce({ id: "id2", emailBody: E2_DISTINCT, sequencePosition: 2 })
      .mockResolvedValueOnce({ id: "id3", emailBody: E3, sequencePosition: 3 });

    await runWriterSequence("lead-1", { writerMode: "ai", outreachTemplate: "meet_online" });

    expect(mocks.runWriter.mock.calls[0][1]).toMatchObject({
      sequencePosition: 1,
      writerMode: "ai",
      outreachTemplate: "meet_online",
    });
    expect(mocks.runWriter.mock.calls[1][1]).toMatchObject({
      sequencePosition: 2,
      writerMode: "ai",
    });
    expect(mocks.runWriter.mock.calls[2][1]).toMatchObject({
      sequencePosition: 3,
      writerMode: "ai",
    });
  });

  it("forwards writerMode when regenerating E2", async () => {
    mocks.outreachFindMany.mockResolvedValue([
      {
        id: "id1",
        emailBody: E1,
        subjectA: "Send happiness this Diwali, Vijetha",
        sequencePosition: 1,
      },
    ]);
    mocks.runWriter.mockResolvedValueOnce("id2");

    await regenerateSequenceStep("lead-1", 2, { writerMode: "ai" });

    expect(mocks.runWriter).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({
        sequencePosition: 2,
        writerMode: "ai",
        followUpMode: "follow_up",
      }),
    );
  });
});
