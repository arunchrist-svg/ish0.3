import { describe, expect, it } from "vitest";
import {
  computeIfOpenedScheduledFor,
  isIfOpenedOpenTrigger,
  resolveNextFollowUpToReplace,
} from "@/lib/email/promote-catalog-on-open";
import {
  isIshFestiveCatalogBody,
  buildIshFestiveCatalogParagraphs,
  buildIshFestiveCatalogParagraphsB,
} from "@/lib/email/ish-festive-catalog";
import { computeFollowUpScheduledFor, sameCalendarDay, zonedLocalToUtc } from "@/lib/email/send-window";

const IST = "Asia/Kolkata";
const weekdays = {
  daysOfWeek: [1, 2, 3, 4, 5] as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>,
  hourStart: 9,
  hourEnd: 17,
  timezone: IST,
};

describe("festive catalogue on open", () => {
  it("detects catalogue bodies", () => {
    expect(isIshFestiveCatalogBody(buildIshFestiveCatalogParagraphs("India Sweet House"))).toBe(true);
    expect(isIshFestiveCatalogBody("Would you be open to a sample box?")).toBe(false);
    expect(isIshFestiveCatalogBody("older draft with nine gifting ranges still counts")).toBe(true);
  });

  it("has no em dashes in catalogue copy", () => {
    expect(buildIshFestiveCatalogParagraphs("India Sweet House")).not.toMatch(/—/);
    expect(buildIshFestiveCatalogParagraphsB("India Sweet House")).not.toMatch(/—/);
  });

  it("includes gemstone collection and non-negotiable standards", () => {
    const body = buildIshFestiveCatalogParagraphs("India Sweet House");
    expect(body).toMatch(/2026 Gemstone Collection/);
    expect(body).toMatch(/Our Non-Negotiable Standards/);
    expect(body).toMatch(/Digital E-Coupons/);
  });

  it("triggers If Opened on Email 1 or Email 2 opens only", () => {
    expect(
      isIfOpenedOpenTrigger({ openedSequenceDay: 0, openedEmailKind: "initial", cadenceDays: [3, 7] }),
    ).toBe(true);
    expect(
      isIfOpenedOpenTrigger({ openedSequenceDay: 3, openedEmailKind: "followup", cadenceDays: [3, 7] }),
    ).toBe(true);
    expect(
      isIfOpenedOpenTrigger({ openedSequenceDay: 7, openedEmailKind: "followup", cadenceDays: [3, 7] }),
    ).toBe(false);
    expect(
      isIfOpenedOpenTrigger({
        openedSequenceDay: 5,
        openedEmailKind: "catalog_on_open",
        cadenceDays: [3, 7],
      }),
    ).toBe(false);
  });

  it("schedules If Opened for the next send-window day after the open", () => {
    const openedAt = zonedLocalToUtc({ year: 2026, month: 8, day: 19, hour: 15, minute: 0 }, IST);
    const scheduled = computeIfOpenedScheduledFor(openedAt, weekdays);
    expect(scheduled).toEqual(computeFollowUpScheduledFor(openedAt, 1, weekdays));
    expect(sameCalendarDay(scheduled, zonedLocalToUtc({ year: 2026, month: 8, day: 20, hour: 15 }, IST), IST)).toBe(
      true,
    );
  });

  it("snaps a Friday-night open to Monday when weekends are closed", () => {
    const openedAt = zonedLocalToUtc({ year: 2026, month: 8, day: 21, hour: 16, minute: 0 }, IST);
    const scheduled = computeIfOpenedScheduledFor(openedAt, weekdays);
    expect(sameCalendarDay(scheduled, zonedLocalToUtc({ year: 2026, month: 8, day: 24, hour: 9 }, IST), IST)).toBe(
      true,
    );
  });

  it("replaces Email 2 after Email 1 open", () => {
    expect(
      resolveNextFollowUpToReplace({
        openedSequenceDay: 0,
        cadenceDays: [3, 7],
        followUps: [
          { id: "e2", sequenceDay: 3, status: "scheduled" },
          { id: "e3", sequenceDay: 7, status: "scheduled" },
        ],
      })?.id,
    ).toBe("e2");
  });

  it("replaces Email 3 after Email 2 open", () => {
    expect(
      resolveNextFollowUpToReplace({
        openedSequenceDay: 3,
        cadenceDays: [3, 7],
        followUps: [{ id: "e3", sequenceDay: 7, status: "scheduled" }],
      })?.id,
    ).toBe("e3");
  });
});
