import { describe, expect, it } from "vitest";
import { sequencerRunCopy } from "@/lib/outreach/sequencer-run-copy";

describe("sequencerRunCopy", () => {
  it("does not treat 0 sent as a successful due-send run", () => {
    expect(sequencerRunCopy({ processed: 0, failed: 0, skipped: 0 })).toMatchObject({
      tone: "info",
      title: "Nothing due right now",
    });
    expect(sequencerRunCopy({ processed: 0 })).toMatchObject({
      tone: "info",
      title: "Nothing due right now",
    });
  });

  it("explains skipped due rows without calling it a success", () => {
    const copy = sequencerRunCopy({ processed: 0, failed: 0, skipped: 12 });
    expect(copy.tone).toBe("info");
    expect(copy.title).toBe("Nothing due right now");
    expect(copy.description).toMatch(/send hours/i);
  });

  it("uses success only when mail actually sent", () => {
    expect(sequencerRunCopy({ processed: 4, failed: 0, skipped: 1 })).toEqual({
      tone: "success",
      title: "Due sends processed",
      description: "4 sent · 1 skipped",
    });
  });
});
