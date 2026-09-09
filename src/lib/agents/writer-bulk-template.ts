import { and, eq, inArray } from "drizzle-orm";
import { db, accounts, contacts, leadOutreach, leads, yieldFunnel } from "@/db";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import { normalizeEmailBody } from "@/lib/email/email-body-format";
import { fillIshCatalogDraftVariants, fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import {
  CATALOG_ON_OPEN_SEQUENCE_POSITION,
  CATALOG_ON_OPEN_VARIANT,
} from "@/lib/email/ish-festive-catalog";
import { isZeroCostTemplateWrite, packIdFromBrand } from "@/lib/email/outreach-templates";
import { deleteLeadOutreachWhere } from "@/lib/outreach/delete-lead-outreach";
import { latestDetectedOccasion, resolveWriteOccasion } from "@/lib/occasions/resolve";
import { FESTIVE_OCCASION_SENTINEL, isFestiveWriteOccasion } from "@/lib/occasions/catalog";
import type { CompanyOverview } from "@/lib/company-overview";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { deliverabilityVerdict } from "@/lib/agents/writer-scoring";

const ISH_TEMPLATE_PROMPT_VERSION = "v2.7-ish-templates";
const CHUNK = 100;
/** Placeholder company used to build one shared reference sequence, then swap per lead. */
const COMPANY_TOKEN = "AcmeBulkRefCo";

type DraftCopy = {
  subjectA: string;
  subjectB: string;
  subjectC?: string;
  emailBody: string;
  emailBodyB?: string;
  emailBodyC?: string;
};

type EmailConfig = Awaited<ReturnType<typeof getResolvedEmailConfig>>;

export function canBulkFillIshTemplate(params: {
  outreachTemplate?: string | null;
  writerMode?: string | null;
}): boolean {
  if (params.writerMode === "ai" && !isZeroCostTemplateWrite(params.outreachTemplate)) {
    return false;
  }
  return Boolean(params.outreachTemplate);
}

function applyCompany(copy: DraftCopy, company: string): DraftCopy {
  const swap = (value?: string) => (value ? value.split(COMPANY_TOKEN).join(company) : value);
  return {
    subjectA: swap(copy.subjectA)!,
    subjectB: swap(copy.subjectB)!,
    subjectC: swap(copy.subjectC),
    emailBody: swap(copy.emailBody)!,
    emailBodyB: swap(copy.emailBodyB),
    emailBodyC: swap(copy.emailBodyC),
  };
}

function buildReferenceSequence(params: {
  emailConfig: EmailConfig;
  templateId: string;
  occasionId: string | null | undefined;
  occasionTiming?: "upcoming" | "recent";
}): { steps: DraftCopy[]; catalog: DraftCopy } {
  const { emailConfig, templateId, occasionId, occasionTiming } = params;
  const sender = emailConfig.fromName.trim() || "Team";
  const brand = emailConfig.brandConfig.brandName;
  const resolvedOccasion =
    occasionId && isFestiveWriteOccasion(occasionId as never)
      ? (occasionId as never)
      : occasionId
        ? (occasionId as never)
        : undefined;
  const shared = {
    contactFirstName: "there",
    companyName: COMPANY_TOKEN,
    senderFirstName: sender,
    brandName: brand,
    templateId,
    occasionId: resolvedOccasion,
    occasionTiming,
    senderPhone: emailConfig.fromPhone,
    fromAddress: emailConfig.fromAddress,
    fromLocation: emailConfig.fromLocation,
    signature: emailConfig.signature,
  } as const;

  const steps: DraftCopy[] = [1, 2, 3].map((sequencePosition) => {
    const copy = fillIshDraftVariants({ ...shared, sequencePosition });
    return {
      subjectA: copy.subjectA,
      subjectB: copy.subjectB,
      subjectC: copy.subjectC,
      emailBody: normalizeEmailBody(copy.emailBody),
      emailBodyB: copy.emailBodyB ? normalizeEmailBody(copy.emailBodyB) : undefined,
      emailBodyC: copy.emailBodyC ? normalizeEmailBody(copy.emailBodyC) : undefined,
    };
  });

  const catalogRaw = fillIshCatalogDraftVariants({
    ...shared,
    sequencePosition: CATALOG_ON_OPEN_SEQUENCE_POSITION,
    occasionId: isFestiveWriteOccasion(occasionId as never)
      ? (occasionId as never)
      : FESTIVE_OCCASION_SENTINEL,
  });
  const catalog: DraftCopy = {
    subjectA: catalogRaw.subjectA,
    subjectB: catalogRaw.subjectB,
    emailBody: normalizeEmailBody(catalogRaw.emailBody),
    emailBodyB: catalogRaw.emailBodyB ? normalizeEmailBody(catalogRaw.emailBodyB) : undefined,
  };

  return { steps, catalog };
}

function outreachGoalForPosition(sequencePosition: number): string {
  if (sequencePosition === 2) return "Follow-up reminder";
  if (sequencePosition === 3) return "Final reminder";
  if (sequencePosition === CATALOG_ON_OPEN_SEQUENCE_POSITION) return "If opened: festive catalogue";
  return "Gift sampling";
}

function rowFromCopy(params: {
  leadId: string;
  sequencePosition: number;
  copy: DraftCopy;
  templateVariant: string;
  deliverabilityScore: number;
}) {
  const { leadId, sequencePosition, copy, templateVariant, deliverabilityScore } = params;
  const isCatalog = sequencePosition === CATALOG_ON_OPEN_SEQUENCE_POSITION;
  return {
    leadId,
    promptVersion: isCatalog ? "v2.8-ish-catalog-on-open" : ISH_TEMPLATE_PROMPT_VERSION,
    draftSource: "template" as const,
    subjectA: copy.subjectA,
    subjectB: copy.subjectB || null,
    subjectC: copy.subjectC || null,
    emailBody: copy.emailBody,
    emailBodyB: copy.emailBodyB || null,
    emailBodyC: copy.emailBodyC || null,
    chosenSubjectKey: "A",
    chosenBodyKey: "A",
    deliverabilityScore,
    deliverabilityVerdict: deliverabilityVerdict(deliverabilityScore),
    revisionCount: 0,
    revisionTimeout: false,
    rubricScore: {
      spam_signal_risk: 25,
      personalization_depth: 25,
      value_clarity: 25,
      cta_quality: 25,
    },
    rubricTotal: isCatalog ? 100 : 100,
    templateVariant,
    outreachGoal: outreachGoalForPosition(sequencePosition),
    confidenceTier: "high",
    sequencePosition,
  };
}

/**
 * Fast path for Write/Rewrite All when every lead uses the same ISH template.
 * Builds one reference sequence, substitutes company per lead, batch-writes DB rows.
 * No LLM and no per-lead Inngest jobs.
 */
export async function bulkFillIshTemplateSequences(params: {
  leadIds: string[];
  tenantId: string;
  outreachTemplate: string;
  occasionTheme?: string | null;
}): Promise<{ written: number; failed: number }> {
  const uniqueIds = [...new Set(params.leadIds.filter(Boolean))];
  if (!uniqueIds.length) return { written: 0, failed: 0 };

  let written = 0;
  let failed = 0;

  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunkIds = uniqueIds.slice(i, i + CHUNK);
    try {
      const rows = await db
        .select({
          leadId: leads.id,
          tenantId: leads.tenantId,
          workspaceId: leads.workspaceId,
          createdByUserId: leads.createdByUserId,
          accountName: accounts.name,
          companyOverview: accounts.companyOverview,
        })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .innerJoin(accounts, eq(accounts.id, leads.accountId))
        .where(and(eq(leads.tenantId, params.tenantId), inArray(leads.id, chunkIds)));

      if (!rows.length) continue;

      // Group by mailbox owner so signatures stay correct.
      const byOwner = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.workspaceId}::${row.createdByUserId ?? ""}`;
        const list = byOwner.get(key) ?? [];
        list.push(row);
        byOwner.set(key, list);
      }

      const outreachValues: ReturnType<typeof rowFromCopy>[] = [];
      const statusLeadIds: string[] = [];

      for (const [ownerKey, ownerRows] of byOwner) {
        const sample = ownerRows[0];
        const emailConfig = await getResolvedEmailConfig(
          sample.workspaceId,
          sample.createdByUserId || undefined,
        );
        if (packIdFromBrand(emailConfig.brandConfig) !== "gifting-sweets") {
          failed += ownerRows.length;
          continue;
        }

        const overview = (sample.companyOverview as CompanyOverview | null) ?? null;
        const occasionId =
          resolveWriteOccasion({
            selected: params.occasionTheme,
            overview,
            campaignMode: emailConfig.campaignMode,
          }) ?? FESTIVE_OCCASION_SENTINEL;
        const detected = latestDetectedOccasion(overview);
        const openingFamily =
          occasionId === "store_opening" ||
          occasionId === "office_inauguration" ||
          occasionId === "foundation_day" ||
          occasionId === "milestone";

        // One shared reference for this mailbox/template; only company differs per lead.
        const reference = buildReferenceSequence({
          emailConfig,
          templateId: params.outreachTemplate,
          occasionId,
          occasionTiming: openingFamily ? detected?.timing : undefined,
        });

        for (const lead of ownerRows) {
          const company = companyNameForEmail(lead.accountName);
          const steps = reference.steps.map((copy) => applyCompany(copy, company));
          const catalog = applyCompany(reference.catalog, company);
          const free = isZeroCostTemplateWrite(params.outreachTemplate);
          const deliv = free ? 92 : 88;

          for (let pos = 0; pos < 3; pos++) {
            outreachValues.push(
              rowFromCopy({
                leadId: lead.leadId,
                sequencePosition: pos + 1,
                copy: steps[pos],
                templateVariant: params.outreachTemplate,
                deliverabilityScore: deliv,
              }),
            );
          }
          outreachValues.push(
            rowFromCopy({
              leadId: lead.leadId,
              sequencePosition: CATALOG_ON_OPEN_SEQUENCE_POSITION,
              copy: catalog,
              templateVariant: CATALOG_ON_OPEN_VARIANT,
              deliverabilityScore: 100,
            }),
          );
          statusLeadIds.push(lead.leadId);
        }

        void ownerKey;
      }

      if (!statusLeadIds.length) continue;

      await deleteLeadOutreachWhere(
        and(
          inArray(leadOutreach.leadId, statusLeadIds),
          inArray(leadOutreach.sequencePosition, [1, 2, 3, CATALOG_ON_OPEN_SEQUENCE_POSITION]),
        ),
      );

      // Insert in slices to stay under Postgres parameter limits.
      const INSERT_SLICE = 200;
      for (let j = 0; j < outreachValues.length; j += INSERT_SLICE) {
        await db.insert(leadOutreach).values(outreachValues.slice(j, j + INSERT_SLICE));
      }

      await db
        .update(leads)
        .set({ status: "draft_ready" })
        .where(inArray(leads.id, statusLeadIds));

      await db.insert(yieldFunnel).values(
        statusLeadIds.map((leadId) => ({
          leadId,
          stage: "draft_ready" as const,
          metadata: { sequence: true, bulkTemplate: params.outreachTemplate },
        })),
      );

      written += statusLeadIds.length;
    } catch (e) {
      console.error("[bulkFillIshTemplateSequences] chunk failed", e);
      failed += chunkIds.length;
    }
  }

  return { written, failed };
}
