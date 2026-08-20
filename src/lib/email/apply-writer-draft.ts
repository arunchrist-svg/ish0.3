export type SequenceDraft = {
  id: string;
  sequencePosition?: number;
  templateVariant?: string;
};

export type LeadDraftState<T extends SequenceDraft> = {
  status: string;
  outreach?: T;
  outreachSequence?: T[];
};

export function upsertDraftInSequence<T extends SequenceDraft>(sequence: T[] | undefined, draft: T): T[] {
  const rows = sequence ?? [];
  const byId = rows.findIndex((d) => d.id === draft.id);
  if (byId >= 0) return rows.map((d, i) => (i === byId ? { ...d, ...draft } : d));
  if (draft.templateVariant === "reply" || draft.sequencePosition == null) return rows;
  const byPos = rows.findIndex((d) => d.sequencePosition === draft.sequencePosition);
  if (byPos >= 0) return rows.map((d, i) => (i === byPos ? draft : d));
  return [...rows, draft].sort((a, b) => (a.sequencePosition ?? 0) - (b.sequencePosition ?? 0));
}

export function applyWriterDraft<T extends SequenceDraft, L extends LeadDraftState<T>>(prev: L, draft: T): L {
  const outreachSequence = upsertDraftInSequence(prev.outreachSequence, draft);
  const replaceOutreach =
    !prev.outreach ||
    prev.outreach.id === draft.id ||
    draft.templateVariant === "reply" ||
    (draft.sequencePosition === 1 && prev.outreach.templateVariant !== "reply");
  return {
    ...prev,
    status: prev.status === "replied" || draft.templateVariant === "reply" ? prev.status : "draft_ready",
    outreach: replaceOutreach ? draft : prev.outreach,
    outreachSequence: outreachSequence.length ? outreachSequence : prev.outreachSequence,
  };
}

export function applyWriterSequence<T extends SequenceDraft, L extends LeadDraftState<T>>(prev: L, drafts: T[]): L {
  const first = drafts.find((d) => d.sequencePosition === 1) ?? drafts[0];
  return {
    ...prev,
    status: "draft_ready",
    outreach: first ?? prev.outreach,
    outreachSequence: drafts.length ? drafts : prev.outreachSequence,
  };
}

export function mergeLeadOutreachFromServer<T extends SequenceDraft, L extends LeadDraftState<T>>(
  prev: L | null,
  incoming: L,
): L {
  if (!prev) return incoming;
  const incomingSeq = incoming.outreachSequence ?? [];
  const prevSeq = prev.outreachSequence ?? [];
  if (incomingSeq.length === 0 && prevSeq.length === 0) {
    return {
      ...incoming,
      outreach: incoming.outreach ?? prev.outreach,
    };
  }
  if (incomingSeq.length === 0) {
    return {
      ...incoming,
      outreach: incoming.outreach ?? prev.outreach,
      outreachSequence: prevSeq,
    };
  }
  if (prevSeq.length === 0) {
    return incoming;
  }

  const prevById = new Map(prevSeq.map((d) => [d.id, d]));
  const merged = incomingSeq.map((d) => prevById.get(d.id) ?? d);
  for (const d of prevSeq) {
    const already =
      incomingSeq.some((row) => row.id === d.id) ||
      (d.sequencePosition != null && incomingSeq.some((row) => row.sequencePosition === d.sequencePosition));
    if (!already) merged.push(d);
  }
  merged.sort((a, b) => (a.sequencePosition ?? 0) - (b.sequencePosition ?? 0));

  const outreach =
    (incoming.outreach && prevById.get(incoming.outreach.id)) ||
    incoming.outreach ||
    prev.outreach;

  return {
    ...incoming,
    outreach,
    outreachSequence: merged,
  };
}
