import { and, eq } from "drizzle-orm";
import { db, leadOutreach, leads, outreachSchedule, contacts, accounts } from "@/db";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { fillIshCatalogDraftVariants } from "@/lib/email/ish-cold-templates";
import {
  CATALOG_ON_OPEN_EMAIL_KIND,
  CATALOG_ON_OPEN_SEQUENCE_POSITION,
  CATALOG_ON_OPEN_VARIANT,
  isCatalogOnOpenSchedule,
} from "@/lib/email/ish-festive-catalog";
import { normalizeEmailBody } from "@/lib/email/email-body-format";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { resolveWriteOccasion } from "@/lib/occasions/resolve";
import { FESTIVE_OCCASION_SENTINEL, isFestiveWriteOccasion } from "@/lib/occasions/catalog";
import type { CompanyOverview } from "@/lib/company-overview";
import { packIdFromBrand } from "@/lib/email/outreach-templates";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";
import { asVariantKey } from "@/lib/email/draft-variants";
import { normalizeCadenceDays } from "@/lib/email/cadence";
import { computeFollowUpScheduledFor, sendWindowFromEmailFields, type SendWindow } from "@/lib/email/send-window";

const CATALOG_PENDING = ["scheduled", "paused", "pending_review"] as const;

type OpenedSchedule = {
  id: string;
  leadId: string;
  sequenceDay: number;
  emailKind: string | null;
  approvalId: string | null;
  sendMode: string | null;
  draftLeadOutreachId: string | null;
};

export function isIfOpenedOpenTrigger(params: {
  openedSequenceDay: number;
  openedEmailKind: string | null;
  cadenceDays: [number, number];
}): boolean {
  const kind = params.openedEmailKind;
  if (kind === CATALOG_ON_OPEN_EMAIL_KIND) return false;
  if (kind === "inbound_reply" || kind === "outbound_reply") return false;
  if (params.openedSequenceDay < 0) return false;
  if (params.openedSequenceDay === 0 || kind === "initial") return true;
  const cadence = normalizeCadenceDays(params.cadenceDays);
  return params.openedSequenceDay === cadence[0];
}

export function computeIfOpenedScheduledFor(openedAt: Date, sendWindow: Partial<SendWindow> | null): Date {
  return computeFollowUpScheduledFor(openedAt, 1, sendWindow);
}

/**
 * The next short follow-up that If Opened replaces after an open.
 * Email 1 open -> Email 2. Email 2 open -> Email 3.
 */
export function resolveNextFollowUpToReplace(params: {
  openedSequenceDay: number;
  cadenceDays: [number, number];
  followUps: Array<{ id: string; sequenceDay: number; status: string }>;
}): { id: string; sequenceDay: number } | null {
  const cadence = normalizeCadenceDays(params.cadenceDays);
  const targetDay =
    params.openedSequenceDay === 0 || params.openedSequenceDay < cadence[0]
      ? cadence[0]
      : cadence[1];

  const pending = params.followUps
    .filter(
      (row) =>
        (row.status === "scheduled" || row.status === "paused" || row.status === "pending_review") &&
        row.sequenceDay > 0,
    )
    .sort((a, b) => a.sequenceDay - b.sequenceDay);

  return pending.find((row) => row.sequenceDay === targetDay) ?? pending[0] ?? null;
}

type CatalogCopy = {
  subjectA: string;
  subjectB: string | null;
  emailBody: string;
  emailBodyB: string | null;
  chosenSubjectKey: string;
  chosenBodyKey: string;
};

async function loadCatalogContext(
  leadId: string,
  opts?: { requireGiftingPack?: boolean },
) {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });
  if (!lead) return null;

  const emailConfig = await getResolvedEmailConfig(lead.workspaceId, lead.createdByUserId || undefined);
  const requirePack = opts?.requireGiftingPack !== false;
  if (requirePack && packIdFromBrand(emailConfig.brandConfig) !== "gifting-sweets") return null;

  const overview = (lead.account as typeof accounts.$inferSelect).companyOverview as CompanyOverview | null;
  const occasionId =
    resolveWriteOccasion({
      selected: null,
      overview,
      campaignMode: emailConfig.campaignMode,
    }) ?? FESTIVE_OCCASION_SENTINEL;
  if (requirePack && !isFestiveWriteOccasion(occasionId)) return null;

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  return {
    lead,
    emailConfig,
    occasionId: isFestiveWriteOccasion(occasionId) ? occasionId : FESTIVE_OCCASION_SENTINEL,
    contact,
    account,
    contactFirstName: contact.firstName ?? contact.name.split(" ")[0],
    companyDisplayName: companyNameForEmail(account.name),
    sender: emailConfig.fromName.trim() || "Team",
  };
}

function generatedCatalogCopy(ctx: NonNullable<Awaited<ReturnType<typeof loadCatalogContext>>>): CatalogCopy {
  const copy = fillIshCatalogDraftVariants({
    contactFirstName: ctx.contactFirstName,
    companyName: ctx.companyDisplayName,
    senderFirstName: ctx.sender,
    brandName: ctx.emailConfig.brandConfig.brandName,
    sequencePosition: CATALOG_ON_OPEN_SEQUENCE_POSITION,
    senderPhone: ctx.emailConfig.fromPhone,
    fromAddress: ctx.emailConfig.fromAddress,
    fromLocation: ctx.emailConfig.fromLocation,
    signature: ctx.emailConfig.signature,
    occasionId: ctx.occasionId,
  });
  return {
    subjectA: copy.subjectA,
    subjectB: copy.subjectB || null,
    emailBody: normalizeEmailBody(copy.emailBody),
    emailBodyB: copy.emailBodyB ? normalizeEmailBody(copy.emailBodyB) : null,
    chosenSubjectKey: "A",
    chosenBodyKey: "A",
  };
}

/**
 * Create or replace the editable If Opened catalogue draft (sequence position 5).
 * Template-filled, not charged as a writer credit.
 * Always available while drafting so A/B can be edited before send.
 */
export async function upsertCatalogOnOpenDraft(leadId: string): Promise<string | null> {
  const ctx = await loadCatalogContext(leadId, { requireGiftingPack: false });
  if (!ctx) return null;

  await deleteLeadOutreachWhere(
    and(
      eq(leadOutreach.leadId, leadId),
      eq(leadOutreach.sequencePosition, CATALOG_ON_OPEN_SEQUENCE_POSITION),
    ),
  );

  const copy = generatedCatalogCopy(ctx);
  const [row] = await db
    .insert(leadOutreach)
    .values({
      leadId,
      promptVersion: "v2.8-ish-catalog-on-open",
      draftSource: "template",
      subjectA: copy.subjectA,
      subjectB: copy.subjectB,
      subjectC: null,
      emailBody: copy.emailBody,
      emailBodyB: copy.emailBodyB,
      emailBodyC: null,
      chosenSubjectKey: copy.chosenSubjectKey,
      chosenBodyKey: copy.chosenBodyKey,
      deliverabilityScore: 100,
      deliverabilityVerdict: "SAFE",
      revisionCount: 0,
      revisionTimeout: false,
      rubricTotal: 100,
      templateVariant: CATALOG_ON_OPEN_VARIANT,
      outreachGoal: "If opened: festive catalogue",
      confidenceTier: "high",
      sequencePosition: CATALOG_ON_OPEN_SEQUENCE_POSITION,
    })
    .returning();

  return row?.id ?? null;
}

/**
 * Return existing If Opened draft id, or create one (without wiping user edits).
 */
export async function ensureCatalogOnOpenDraft(leadId: string): Promise<string | null> {
  const existing = await db.query.leadOutreach.findFirst({
    where: and(
      eq(leadOutreach.leadId, leadId),
      eq(leadOutreach.sequencePosition, CATALOG_ON_OPEN_SEQUENCE_POSITION),
    ),
  });
  if (existing?.id) {
    // Backfill Option B if an older draft only has A.
    if (!existing.emailBodyB?.trim() || !existing.subjectB?.trim()) {
      const ctx = await loadCatalogContext(leadId, { requireGiftingPack: false });
      if (ctx) {
        const copy = generatedCatalogCopy(ctx);
        await db
          .update(leadOutreach)
          .set({
            subjectB: existing.subjectB?.trim() ? existing.subjectB : copy.subjectB,
            emailBodyB: existing.emailBodyB?.trim() ? existing.emailBodyB : copy.emailBodyB,
            templateVariant: CATALOG_ON_OPEN_VARIANT,
          })
          .where(eq(leadOutreach.id, existing.id));
      }
    }
    return existing.id;
  }
  return upsertCatalogOnOpenDraft(leadId);
}

async function ensureCatalogDraftId(leadId: string): Promise<string | null> {
  return ensureCatalogOnOpenDraft(leadId);
}

/**
 * After an open on Email 1 or Email 2, send the selected If Opened A/B draft
 * on the next send-window day instead of the next short follow-up.
 */
export async function scheduleCatalogOnOpenAfterOpen(params: {
  leadId: string;
  openedSchedule: OpenedSchedule;
  openedAt: Date;
}): Promise<{ scheduled: boolean; scheduleId?: string; cancelledFollowUpId?: string }> {
  const ctx = await loadCatalogContext(params.leadId);
  if (!ctx) return { scheduled: false };
  if (ctx.lead.status !== "outreached") return { scheduled: false };

  const cadenceDays = normalizeCadenceDays(ctx.emailConfig.cadenceDays);
  if (
    !isIfOpenedOpenTrigger({
      openedSequenceDay: params.openedSchedule.sequenceDay,
      openedEmailKind: params.openedSchedule.emailKind,
      cadenceDays,
    })
  ) {
    return { scheduled: false };
  }

  const catalogDraftId = await ensureCatalogDraftId(params.leadId);
  if (!catalogDraftId) return { scheduled: false };

  const schedules = await db.query.outreachSchedule.findMany({
    where: eq(outreachSchedule.leadId, params.leadId),
  });

  if (schedules.some((row) => row.bouncedAt && row.sendMode !== "test")) {
    return { scheduled: false };
  }

  const catalogRows = schedules.filter((row) => isCatalogOnOpenSchedule(row, catalogDraftId));
  if (catalogRows.some((row) => row.status === "sent" || row.sentAt)) {
    return { scheduled: false };
  }
  if (catalogRows.some((row) => CATALOG_PENDING.includes(row.status as (typeof CATALOG_PENDING)[number]))) {
    return { scheduled: false };
  }

  const pendingFollowUps = schedules.filter(
    (row) =>
      (row.status === "scheduled" || row.status === "paused" || row.status === "pending_review") &&
      row.sequenceDay > 0 &&
      !isCatalogOnOpenSchedule(row, catalogDraftId),
  );
  const nextFollowUp = resolveNextFollowUpToReplace({
    openedSequenceDay: params.openedSchedule.sequenceDay,
    cadenceDays,
    followUps: pendingFollowUps.map((row) => ({
      id: row.id,
      sequenceDay: row.sequenceDay,
      status: row.status,
    })),
  });

  if (nextFollowUp) {
    await db
      .update(outreachSchedule)
      .set({ status: "cancelled" })
      .where(eq(outreachSchedule.id, nextFollowUp.id));
  }

  const sendWindow: Partial<SendWindow> = sendWindowFromEmailFields(ctx.emailConfig);
  const scheduledFor = computeIfOpenedScheduledFor(params.openedAt, sendWindow);

  const remainingPending = pendingFollowUps.filter((row) => row.id !== nextFollowUp?.id);
  const pausedSequence =
    remainingPending.some((row) => row.status === "paused") &&
    !remainingPending.some((row) => row.status === "scheduled" || row.status === "pending_review");

  const [inserted] = await db
    .insert(outreachSchedule)
    .values({
      leadId: params.leadId,
      approvalId: params.openedSchedule.approvalId,
      channel: "email",
      sequenceDay: CATALOG_ON_OPEN_SEQUENCE_POSITION,
      scheduledFor,
      sendMode: ctx.emailConfig.sendMode,
      trackingToken: crypto.randomUUID(),
      status: pausedSequence ? "paused" : "scheduled",
      emailKind: CATALOG_ON_OPEN_EMAIL_KIND,
      draftLeadOutreachId: catalogDraftId,
    })
    .returning({ id: outreachSchedule.id });

  return {
    scheduled: Boolean(inserted?.id),
    scheduleId: inserted?.id,
    cancelledFollowUpId: nextFollowUp?.id,
  };
}
