import { describe, expect, it } from "vitest";
import { boardDateMetaLine, countedForIso, formatBoardDate, formatBoardDateTime } from "@/lib/email/board-date-labels";

const IST = "Asia/Kolkata";

describe("board-date-labels", () => {
  it("prefers sent_at for counted day", () => {
    expect(
      countedForIso({
        lastEmailSentAt: "2026-09-15T02:36:02.000Z",
        pendingSendScheduledFor: "2026-09-15T01:30:00.000Z",
      }),
    ).toBe("2026-09-15T02:36:02.000Z");
  });

  it("falls back to scheduled_for while queued", () => {
    expect(
      countedForIso({
        lastEmailSentAt: null,
        pendingSendScheduledFor: "2026-09-15T01:30:00.000Z",
      }),
    ).toBe("2026-09-15T01:30:00.000Z");
  });

  it("builds counted + sent meta line", () => {
    const line = boardDateMetaLine({
      lastEmailSentAt: "2026-09-15T02:36:02.000Z",
      pendingSendScheduledFor: "2026-09-15T01:30:00.000Z",
    });
    expect(line).toContain("Counted");
    expect(line).toContain("Sent");
    expect(formatBoardDate("2026-09-15T02:36:02.000Z")).toBeTruthy();
    expect(formatBoardDateTime("2026-09-15T02:36:02.000Z")).toContain(",");
  });

  it("says today and tomorrow in India send time, not weekday", () => {
    const sundayNightIst = new Date("2026-09-20T17:29:00.000Z");
    expect(formatBoardDateTime("2026-09-20T16:00:00.000Z", sundayNightIst, IST)).toMatch(/^today,/);
    expect(formatBoardDateTime("2026-09-21T03:51:00.000Z", sundayNightIst, IST)).toMatch(/^tomorrow,/);
    expect(formatBoardDateTime("2026-09-22T03:51:00.000Z", sundayNightIst, IST)).toMatch(/Tue/i);
  });

  it("shows only counted when not yet sent", () => {
    const line = boardDateMetaLine({
      lastEmailSentAt: null,
      pendingSendScheduledFor: "2026-09-15T01:30:00.000Z",
    });
    expect(line).toMatch(/^Counted /);
    expect(line).not.toContain("Sent");
  });
});
