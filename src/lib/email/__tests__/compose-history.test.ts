import { describe, expect, it } from "vitest";
import {
  applyComposeSnapshot,
  commitComposeSnapshot,
  createComposeHistory,
  redoCompose,
  snapshotFromDraft,
  snapshotsEqual,
  undoCompose,
} from "@/lib/email/compose-history";

const a = snapshotFromDraft({ subjectA: "Hi", emailBody: "Body A" });
const b = snapshotFromDraft({ subjectA: "Hi", emailBody: "Body B" });
const c = snapshotFromDraft({ subjectA: "Hello", emailBody: "Body C" });

describe("compose-history", () => {
  it("commits and undoes typing snapshots", () => {
    let state = createComposeHistory(a);
    state = commitComposeSnapshot(state, b);
    state = commitComposeSnapshot(state, c);
    expect(state.present).toEqual(c);
    expect(state.past).toHaveLength(2);

    const undone = undoCompose(state)!;
    expect(undone.present).toEqual(b);
    expect(redoCompose(undone)!.present).toEqual(c);
  });

  it("ignores no-op commits and clears future on new edit", () => {
    let state = createComposeHistory(a);
    state = commitComposeSnapshot(state, b);
    const undone = undoCompose(state)!;
    expect(undone.future).toHaveLength(1);
    state = commitComposeSnapshot(undone, c);
    expect(state.future).toHaveLength(0);
    expect(commitComposeSnapshot(state, c)).toBe(state);
  });

  it("applies snapshots onto drafts", () => {
    const draft = { id: "1", subjectA: "x", emailBody: "y", emailBodyB: "z" };
    const next = applyComposeSnapshot(draft, b);
    expect(next.emailBody).toBe("Body B");
    expect(next.id).toBe("1");
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});
