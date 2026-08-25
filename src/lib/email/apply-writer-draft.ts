import { buildDraftsEmailThread, type EmailThread } from "@/lib/email/email-thread";

export type SequenceDraft = {
  id: string;
  sequencePosition?: number;
  templateVariant?: string;
  subjectA?: string | null;
  emailBody?: string | null;
};

export type LeadDraftState<T extends SequenceDraft> = {
  status: string;
  outreach?: T;
  outreachSequence?: T[];
  emailThread?: EmailThread;
};

function withDraftsThread<T extends SequenceDraft, L extends LeadDraftState<T>>(
  lead: L,
  sequence: T[] | undefined,
): L {
  const drafts = sequence ?? [];
  const railEligible = drafts.some(
    (d) => d.templateVariant !== "reply" && d.sequencePosition != null && d.sequencePosition >= 1,
  );
  if (!railEligible) return lead;

  const emailThread = buildDraftsEmailThread(drafts, { previous: lead.emailThread });
  if (!emailThread) return lead;

  // Do not clobber an active/sent sequence rail with a drafts rebuild.
  const mode = lead.emailThread?.barMode;
  if (mode === "sequence" || mode === "reply") return lead;

  return { ...lead, emailThread };
}

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
  const next = {
    ...prev,
    status: prev.status === "replied" || draft.templateVariant === "reply" ? prev.status : "draft_ready",
    outreach: replaceOutreach ? draft : prev.outreach,
    outreachSequence: outreachSequence.length ? outreachSequence : prev.outreachSequence,
  } as L;
  return withDraftsThread(next, next.outreachSequence);
}

export function applyWriterSequence<T extends SequenceDraft, L extends LeadDraftState<T>>(prev: L, drafts: T[]): L {
  const first = drafts.find((d) => d.sequencePosition === 1) ?? drafts[0];
  const next = {
    ...prev,
    status: "draft_ready",
    outreach: first ?? prev.outreach,
    outreachSequence: drafts.length ? drafts : prev.outreachSequence,
  } as L;
  return withDraftsThread(next, next.outreachSequence);
}

export function mergeLeadOutreachFromServer<T extends SequenceDraft, L extends LeadDraftState<T>>(
  prev: L | null,
  incoming: L,
): L {
  if (!prev) return incoming;
  const incomingSeq = incoming.outreachSequence ?? [];
  const prevSeq = prev.outreachSequence ?? [];

  // Server cleared outreach (e.g. Restart). Keep local drafts only while status is still draft_ready.
  if (incomingSeq.length === 0 && !incoming.outreach) {
    if (incoming.status === "draft_ready") {
      const kept = {
        ...incoming,
        outreach: prev.outreach,
        outreachSequence: prevSeq.length ? prevSeq : undefined,
        emailThread: prev.emailThread ?? incoming.emailThread,
      } as L;
      return withDraftsThread(kept, kept.outreachSequence);
    }
    return incoming;
  }

  if (incomingSeq.length === 0 && prevSeq.length === 0) {
    return {
      ...incoming,
      outreach: incoming.outreach ?? prev.outreach,
    };
  }
  if (incomingSeq.length === 0) {
    // Stale/cached lead fetch often lands here right after Writer create.
    // Keep local drafts and the drafts rail; do not adopt a hidden empty thread.
    const kept = {
      ...incoming,
      outreach: incoming.outreach ?? prev.outreach,
      outreachSequence: prevSeq,
      emailThread:
        incoming.emailThread &&
        incoming.emailThread.barMode !== "hidden" &&
        incoming.emailThread.barNodes.length > 0
          ? incoming.emailThread
          : prev.emailThread ?? incoming.emailThread,
    } as L;
    return withDraftsThread(kept, kept.outreachSequence);
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

  const serverThread = incoming.emailThread;
  const emailThread =
    serverThread && serverThread.barMode !== "hidden" && serverThread.barNodes.length > 0
      ? serverThread
      : prev.emailThread ?? serverThread;

  return {
    ...incoming,
    outreach,
    outreachSequence: merged,
    emailThread,
  };
}
