import { and, eq, inArray } from "drizzle-orm";
import { db, leadOutreach, leads, outreachSchedule, contacts, accounts } from "@/db";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { isIshFestiveCatalogBody } from "@/lib/email/ish-festive-catalog";
import { normalizeEmailBody } from "@/lib/email/email-body-format";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { resolveWriteOccasion } from "@/lib/occasions/resolve";
import { FESTIVE_OCCASION_SENTINEL, isFestiveWriteOccasion } from "@/lib/occasions/catalog";
import type { CompanyOverview } from "@/lib/company-overview";
import { packIdFromBrand } from "@/lib/email/outreach-templates";

/**
 * Pick which pending follow-up (2 or 3) should become the festive catalogue
 * after an open on an earlier email.
 *
 * - Email 1 opened -> upgrade Email 2 if not already catalog
 * - Email 2 opened (and Email 2 was not already catalog) -> upgrade Email 3
 */
export function resolveCatalogUpgradeTarget(params: {
  openedSequenceDay: number;
  drafts: Array<{ sequencePosition: number | null; emailBody: string | null }>;
}): 2 | 3 | null {
  const e2 = params.drafts.find((d) => d.sequencePosition === 2);
  const e3 = params.drafts.find((d) => d.sequencePosition === 3);

  if (params.openedSequenceDay === 0) {
    if (e2 && !isIshFestiveCatalogBody(e2.emailBody)) return 2;
    return null;
  }

  if (params.openedSequenceDay > 0) {
    if (isIshFestiveCatalogBody(e2?.emailBody)) return null;
    if (e3 && !isIshFestiveCatalogBody(e3.emailBody)) return 3;
  }

  return null;
}

async function rewriteDraftAsCatalog(params: {
  leadId: string;
  draftId: string;
  sequencePosition: 2 | 3;
}): Promise<{ outreachId: string; emailBody: string; subjectA: string } | null> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, params.leadId),
    with: { contact: true, account: true },
  });
  if (!lead) return null;

  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  if (packIdFromBrand(emailConfig.brandConfig) !== "gifting-sweets") return null;

  const overview = (lead.account as typeof accounts.$inferSelect).companyOverview as CompanyOverview | null;
  const occasionId =
    resolveWriteOccasion({
      selected: null,
      overview,
      campaignMode: emailConfig.campaignMode,
    }) ?? FESTIVE_OCCASION_SENTINEL;
  if (!isFestiveWriteOccasion(occasionId)) return null;

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const companyDisplayName = companyNameForEmail(account.name);
  const sender = emailConfig.fromName.trim() || "Team";

  const copy = fillIshDraftVariants({
    contactFirstName,
    companyName: companyDisplayName,
    senderFirstName: sender,
    brandName: emailConfig.brandConfig.brandName,
    sequencePosition: params.sequencePosition,
    inboxOpened: true,
    senderPhone: emailConfig.fromPhone,
    fromAddress: emailConfig.fromAddress,
    fromLocation: emailConfig.fromLocation,
    occasionId,
  });

  const emailBody = normalizeEmailBody(copy.emailBody);
  const emailBodyB = copy.emailBodyB ? normalizeEmailBody(copy.emailBodyB) : null;

  const [updated] = await db
    .update(leadOutreach)
    .set({
      subjectA: copy.subjectA,
      subjectB: copy.subjectB,
      subjectC: null,
      emailBody,
      emailBodyB,
      emailBodyC: null,
      chosenSubjectKey: "A",
      chosenBodyKey: "A",
      outreachGoal: "Festive catalogue (opened)",
      deliverabilityScore: 100,
      deliverabilityVerdict: "SAFE",
      revisionTimeout: false,
      rubricTotal: 100,
      promptVersion: "v2.8-ish-catalog-on-open",
      draftSource: "template",
    })
    .where(eq(leadOutreach.id, params.draftId))
    .returning();

  if (!updated?.emailBody) return null;
  return {
    outreachId: updated.id,
    emailBody: updated.emailBody,
    subjectA: updated.subjectA ?? copy.subjectA,
  };
}

export async function promoteFollowUpToFestiveCatalog(params: {
  leadId: string;
  openedSequenceDay: number;
}): Promise<{ upgraded: boolean; sequencePosition?: 2 | 3; outreachId?: string }> {
  const drafts = await db.query.leadOutreach.findMany({
    where: and(eq(leadOutreach.leadId, params.leadId), inArray(leadOutreach.sequencePosition, [1, 2, 3])),
  });

  const target = resolveCatalogUpgradeTarget({
    openedSequenceDay: params.openedSequenceDay,
    drafts,
  });
  if (!target) return { upgraded: false };

  const targetDraft = drafts.find((d) => d.sequencePosition === target);
  if (!targetDraft) return { upgraded: false };

  const linkedSchedule = await db.query.outreachSchedule.findFirst({
    where: and(
      eq(outreachSchedule.leadId, params.leadId),
      eq(outreachSchedule.draftLeadOutreachId, targetDraft.id),
    ),
  });

  if (linkedSchedule?.status === "sent" || linkedSchedule?.sentAt) {
    return { upgraded: false };
  }

  const rewritten = await rewriteDraftAsCatalog({
    leadId: params.leadId,
    draftId: targetDraft.id,
    sequencePosition: target,
  });
  if (!rewritten) return { upgraded: false };

  return {
    upgraded: true,
    sequencePosition: target,
    outreachId: rewritten.outreachId,
  };
}

function shouldUseCatalogForFollowUp(params: {
  sequencePosition: 2 | 3;
  schedules: Array<{
    sequenceDay: number;
    openedAt: Date | null;
    draftLeadOutreachId: string | null;
    emailKind: string | null;
  }>;
  e2Body: string | null | undefined;
}): boolean {
  const e1 = params.schedules.find((row) => row.sequenceDay === 0);
  const e1Opened = Boolean(e1?.openedAt);

  if (params.sequencePosition === 2) {
    return e1Opened;
  }

  // Email 3: only if a prior open happened and Email 2 was not already the catalogue.
  if (isIshFestiveCatalogBody(params.e2Body)) return false;

  const e2 = params.schedules.find(
    (row) => row.sequenceDay > 0 && (row.emailKind === "followup" || row.draftLeadOutreachId),
  );
  return Boolean(e2?.openedAt) || e1Opened;
}

/**
 * Right before sending Email 2/3: if an earlier email was opened and this draft
 * is still the short sample nudge, swap in the catalogue copy.
 */
export async function ensureCatalogFollowUpBeforeSend(params: {
  leadId: string;
  followUpOutreachId: string;
  sequencePosition: number;
}): Promise<{ emailBody: string; subjectA: string } | null> {
  if (params.sequencePosition !== 2 && params.sequencePosition !== 3) return null;

  const current = await db.query.leadOutreach.findFirst({
    where: eq(leadOutreach.id, params.followUpOutreachId),
  });
  if (!current || isIshFestiveCatalogBody(current.emailBody)) return null;

  const schedules = await db.query.outreachSchedule.findMany({
    where: and(eq(outreachSchedule.leadId, params.leadId), eq(outreachSchedule.status, "sent")),
  });
  const e2Draft = await db.query.leadOutreach.findFirst({
    where: and(eq(leadOutreach.leadId, params.leadId), eq(leadOutreach.sequencePosition, 2)),
  });

  if (
    !shouldUseCatalogForFollowUp({
      sequencePosition: params.sequencePosition,
      schedules,
      e2Body: e2Draft?.emailBody,
    })
  ) {
    return null;
  }

  const rewritten = await rewriteDraftAsCatalog({
    leadId: params.leadId,
    draftId: params.followUpOutreachId,
    sequencePosition: params.sequencePosition,
  });
  if (!rewritten) return null;
  return { emailBody: rewritten.emailBody, subjectA: rewritten.subjectA };
}
