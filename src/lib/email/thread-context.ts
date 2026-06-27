import { db, outreachSchedule } from "@/db";
import { and, eq, asc } from "drizzle-orm";
import type { leads } from "@/db/schema";
import { appendReference, buildReferencesChain, normalizeReplySubject, stripReplyPrefix } from "@/lib/email/threading";

type LeadRow = typeof leads.$inferSelect;

export async function loadThreadContext(leadId: string, lead: LeadRow) {
  const sentRows = await db
    .select()
    .from(outreachSchedule)
    .where(and(eq(outreachSchedule.leadId, leadId), eq(outreachSchedule.status, "sent")))
    .orderBy(asc(outreachSchedule.sentAt));

  const initialRow = sentRows.find((r) => r.sequenceDay === 0 || r.emailKind === "initial");
  const rootMessageId = lead.threadRootMessageId ?? initialRow?.rfcMessageId ?? null;
  const rootSubject =
    lead.threadRootSubject ??
    (initialRow?.subjectSent ? stripReplyPrefix(initialRow.subjectSent) : null);

  const outboundIds = sentRows
    .map((r) => r.rfcMessageId)
    .filter((id): id is string => Boolean(id));

  const referencesChain = buildReferencesChain(rootMessageId, ...outboundIds);

  return {
    rootMessageId,
    rootSubject,
    referencesChain,
    inboundMessageId: lead.lastInboundMessageId ?? null,
  };
}

export function resolveOutboundSubject(params: {
  isReplySend: boolean;
  rootSubject: string | null;
  fallbackSubject: string;
}): string {
  if (params.isReplySend && params.rootSubject) {
    return normalizeReplySubject(params.rootSubject);
  }
  if (!params.isReplySend) return params.fallbackSubject;
  return normalizeReplySubject(stripReplyPrefix(params.fallbackSubject));
}

export function resolveThreadHeaders(params: {
  isReplySend: boolean;
  isFollowUp: boolean;
  rootMessageId: string | null;
  inboundMessageId: string | null;
  referencesChain: string;
}): { inReplyTo?: string; references?: string } {
  if (params.isReplySend) {
    const inReplyTo = params.inboundMessageId ?? params.rootMessageId ?? undefined;
    const references = inReplyTo
      ? appendReference(params.referencesChain || params.rootMessageId, params.inboundMessageId ?? "")
      : params.referencesChain || undefined;
    return {
      inReplyTo,
      references: references?.trim() || undefined,
    };
  }
  if (params.isFollowUp && params.rootMessageId) {
    return {
      inReplyTo: params.rootMessageId,
      references: params.referencesChain || params.rootMessageId,
    };
  }
  return {};
}
