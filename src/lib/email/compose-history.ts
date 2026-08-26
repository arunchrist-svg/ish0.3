/** Undo/redo snapshots for email subject + body fields in compose. */

export type ComposeSnapshot = {
  subjectA: string;
  subjectB: string;
  subjectC: string;
  emailBody: string;
  emailBodyB: string;
  emailBodyC: string;
};

export type ComposeHistoryState = {
  past: ComposeSnapshot[];
  present: ComposeSnapshot;
  future: ComposeSnapshot[];
};

export const COMPOSE_HISTORY_LIMIT = 50;

export function emptyComposeSnapshot(): ComposeSnapshot {
  return {
    subjectA: "",
    subjectB: "",
    subjectC: "",
    emailBody: "",
    emailBodyB: "",
    emailBodyC: "",
  };
}

export function snapshotFromDraft(draft: {
  subjectA?: string | null;
  subjectB?: string | null;
  subjectC?: string | null;
  emailBody?: string | null;
  emailBodyB?: string | null;
  emailBodyC?: string | null;
}): ComposeSnapshot {
  return {
    subjectA: draft.subjectA ?? "",
    subjectB: draft.subjectB ?? "",
    subjectC: draft.subjectC ?? "",
    emailBody: draft.emailBody ?? "",
    emailBodyB: draft.emailBodyB ?? "",
    emailBodyC: draft.emailBodyC ?? "",
  };
}

export function applyComposeSnapshot<T>(draft: T, snap: ComposeSnapshot): T {
  return {
    ...draft,
    subjectA: snap.subjectA,
    subjectB: snap.subjectB,
    subjectC: snap.subjectC,
    emailBody: snap.emailBody,
    emailBodyB: snap.emailBodyB,
    emailBodyC: snap.emailBodyC,
  };
}

export function snapshotsEqual(a: ComposeSnapshot, b: ComposeSnapshot): boolean {
  return (
    a.subjectA === b.subjectA &&
    a.subjectB === b.subjectB &&
    a.subjectC === b.subjectC &&
    a.emailBody === b.emailBody &&
    a.emailBodyB === b.emailBodyB &&
    a.emailBodyC === b.emailBodyC
  );
}

export function createComposeHistory(present: ComposeSnapshot): ComposeHistoryState {
  return { past: [], present, future: [] };
}

/** Commit a new present snapshot (typing pause or AI revise). No-op if unchanged. */
export function commitComposeSnapshot(
  state: ComposeHistoryState,
  next: ComposeSnapshot,
  limit = COMPOSE_HISTORY_LIMIT,
): ComposeHistoryState {
  if (snapshotsEqual(state.present, next)) return state;
  const past = [...state.past, state.present];
  while (past.length > limit) past.shift();
  return { past, present: next, future: [] };
}

export function undoCompose(state: ComposeHistoryState): ComposeHistoryState | null {
  if (state.past.length === 0) return null;
  const past = [...state.past];
  const previous = past.pop()!;
  return {
    past,
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoCompose(state: ComposeHistoryState): ComposeHistoryState | null {
  if (state.future.length === 0) return null;
  const [next, ...future] = state.future;
  return {
    past: [...state.past, state.present],
    present: next,
    future,
  };
}
