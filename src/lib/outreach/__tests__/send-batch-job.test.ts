import { describe, expect, it } from "vitest";
import { progressFromRemaining, summarizeBatchQueueErrors } from "@/lib/outreach/send-batch-progress";

describe("progressFromRemaining", () => {
  it("counts down remaining sendable leads without exceeding the batch size", () => {
    expect(progressFromRemaining(49, 49)).toEqual({ completed: 0, total: 49 });
    expect(progressFromRemaining(49, 12)).toEqual({ completed: 37, total: 49 });
    expect(progressFromRemaining(49, 0)).toEqual({ completed: 49, total: 49 });
  });

  it("does not count already-queued leads as this batch", () => {
    expect(progressFromRemaining(49, 107)).toEqual({ completed: 0, total: 49 });
  });
});

describe("summarizeBatchQueueErrors", () => {
  it("drops lead ids and collapses missing-email failures", () => {
    expect(
      summarizeBatchQueueErrors([
        "cd4c3cb4-8c9f-4bb5-aa43-889c3bf35444: Contact has no usable email address. Add one with Add another email, then send.",
        "Ada Sharma: Contact has no usable email address. Add one with Add another email, then send.",
        "Bo Patel: Contact has no usable email address. Add one with Add another email, then send.",
      ]),
    ).toEqual([
      "3 contacts have no usable email. Add one with Add another email, then Send All.",
    ]);
  });

  it("collapses firstname@ empty To failures", () => {
    const hint =
      "To is empty. Pick an inbox from Send to, or add one. firstname@ and lastname@ guesses are not sent until you select them.";
    expect(summarizeBatchQueueErrors([`Lead: ${hint}`, `Other: ${hint}`])).toEqual([
      "2 contacts only have firstname@ or lastname@ guesses. Pick an inbox on the card, then Send All.",
    ]);
  });
});
