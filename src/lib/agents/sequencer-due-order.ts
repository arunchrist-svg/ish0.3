import { CATALOG_ON_OPEN_EMAIL_KIND } from "@/lib/email/ish-festive-catalog";

/** If Opened catalogs drain before Email 1 and other follow-ups. */
export function compareSequencerDueRows(
  a: { emailKind: string | null; scheduledFor: Date; sequenceDay: number },
  b: { emailKind: string | null; scheduledFor: Date; sequenceDay: number },
): number {
  const aPrio = a.emailKind === CATALOG_ON_OPEN_EMAIL_KIND ? 0 : 1;
  const bPrio = b.emailKind === CATALOG_ON_OPEN_EMAIL_KIND ? 0 : 1;
  if (aPrio !== bPrio) return aPrio - bPrio;
  const byTime = a.scheduledFor.getTime() - b.scheduledFor.getTime();
  if (byTime !== 0) return byTime;
  return a.sequenceDay - b.sequenceDay;
}
