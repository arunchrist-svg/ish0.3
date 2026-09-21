import { describe, expect, it } from "vitest";
import { compareSequencerDueRows } from "@/lib/agents/sequencer-due-order";
import { CATALOG_ON_OPEN_EMAIL_KIND } from "@/lib/email/ish-festive-catalog";

function row(overrides: {
  emailKind: string | null;
  scheduledFor: Date;
  sequenceDay: number;
}) {
  return overrides;
}

describe("compareSequencerDueRows", () => {
  const t0 = new Date("2026-09-21T01:30:00.000Z");
  const t1 = new Date("2026-09-21T01:31:00.000Z");

  it("sends due catalog_on_open before due Email 1", () => {
    const catalog = row({
      emailKind: CATALOG_ON_OPEN_EMAIL_KIND,
      scheduledFor: t1,
      sequenceDay: 5,
    });
    const email1 = row({
      emailKind: "initial",
      scheduledFor: t0,
      sequenceDay: 0,
    });
    expect(compareSequencerDueRows(catalog, email1)).toBeLessThan(0);
    expect([email1, catalog].sort(compareSequencerDueRows)).toEqual([catalog, email1]);
  });

  it("keeps earlier scheduledFor among catalogs", () => {
    const a = row({ emailKind: CATALOG_ON_OPEN_EMAIL_KIND, scheduledFor: t0, sequenceDay: 5 });
    const b = row({ emailKind: CATALOG_ON_OPEN_EMAIL_KIND, scheduledFor: t1, sequenceDay: 5 });
    expect(compareSequencerDueRows(a, b)).toBeLessThan(0);
  });

  it("falls back to sequenceDay for non-catalog rows", () => {
    const email1 = row({ emailKind: "initial", scheduledFor: t0, sequenceDay: 0 });
    const email2 = row({ emailKind: "followup", scheduledFor: t0, sequenceDay: 3 });
    expect(compareSequencerDueRows(email1, email2)).toBeLessThan(0);
  });
});
