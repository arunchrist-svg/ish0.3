import { db, accounts, contacts, leads, yieldFunnel, enrichmentRuns } from "@/db";
import { verifyEmail } from "@/lib/enrichment/verify";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { logAudit } from "@/lib/audit";
import { enqueueResearchForLeads } from "@/lib/jobs/enqueue";
import { callLLM } from "@/lib/llm";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { eq, and, desc } from "drizzle-orm";
import {
  enrichPersonContact,
  shouldAutoAcceptEmail,
  isNamedPerson,
} from "@/lib/enrichment/enrich-lead";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { enrichModeForSettings } from "@/lib/enrichment/provider-config";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { isGenericCompanyEmail, sanitizeEmail } from "@/lib/enrichment/validate-contact";

const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";

const BUYING_TITLE_KEYWORDS = [
  "hr",
  "human resources",
  "admin",
  "procurement",
  "director",
  "head",
  "vp",
  "vice president",
  "chief",
  "manager",
  "founder",
  "co-founder",
  "ceo",
  "chro",
  "cpo",
  "people",
  "facilities",
  "office",
];

function looksLikeDecisionMaker(person: ScoutPersonResult): boolean {
  if (person.isKeyDM) return true;
  const title = (person.title ?? "").toLowerCase();
  return BUYING_TITLE_KEYWORDS.some((keyword) => title.includes(keyword));
}

async function preFilterCheck(
  person: ScoutPersonResult,
  company: ScoutCompanyResult,
  leadSource?: string,
): Promise<{ pass: boolean; reason: string }> {
  if (leadSource === "scout_wizard") {
    return { pass: true, reason: "user-selected from scout wizard" };
  }

  if (looksLikeDecisionMaker(person)) {
    return { pass: true, reason: "decision-maker title match" };
  }

  try {
    const raw = await callLLM({
      tier: "fast",
      system: `You are a B2B lead relevance classifier for a corporate gifting company (India Sweet House).
Output ONLY valid JSON: { "pass": boolean, "reason": string }
Pass = true if the company appears to be a real, current Indian business and the person could plausibly influence employee gifting.
Unknown employee count or a generic industry label (e.g. Corporate) alone is NOT a reason to reject.
Pass = false only for: clearly foreign/non-Indian companies, obvious hobby/solo businesses, irrelevant personal profiles, or clearly hallucinated entries.`,
      prompt: `Company: ${company.name}, City: ${company.city ?? "India"}, Industry: ${company.industry ?? "unknown"}, Employees: ${company.employees ?? "unknown"}
Person: ${person.name}, Title: ${person.title ?? "unknown"}
Is this a valid corporate gifting target?`,
      maxTokens: 128,
    });
    const parsed = parseJsonObjectFromLLM(raw);
    return { pass: !!parsed.pass, reason: (parsed.reason as string) ?? "" };
  } catch {
    return { pass: true, reason: "pre-filter skipped (llm error)" };
  }
}

export type SaveLeadsResult = {
  saved: { leadId: string; name: string; emailStatus: string }[];
  skipped: { name: string; reason: string }[];
};

export async function saveScoutLeads(params: {
  people: ScoutPersonResult[];
  company: ScoutCompanyResult;
  dataMode?: DataMode;
  leadSource?: string;
  tenantId: string;
  workspaceId: string;
  enrichmentConfig?: EnrichmentConfig;
}): Promise<SaveLeadsResult> {
  const { people, company, tenantId, workspaceId } = params;
  const dataMode = (params.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
  const leadSource = params.leadSource ?? "scout";
  const cfg =
    params.enrichmentConfig ??
    (await getResolvedWorkspaceEnrichmentConfig({ dataMode }));
  const shouldEnrich = cfg.enrichOnImport && cfg.enrichProvider !== "none";
  const enrichMode = enrichModeForSettings(cfg.enrichProvider, cfg.dataMode);
  let resolvedAccountId: string;
  const [account] = await db
    .insert(accounts)
    .values({
      tenantId,
      workspaceId,
      name: company.name,
      domain: company.domain,
      website: company.website,
      industry: company.industry,
      city: company.city,
      employees: company.employees,
      logo: company.logo,
      giftScore: company.giftScore,
      giftBudget: company.giftBudget,
      revenue: company.revenue,
      pastGifting: company.pastGifting ?? [],
      intelNotes: company.intelNotes,
      companyOverview: company.companyOverview ?? null,
      dataSource: company.dataSource,
      externalId: company.externalId,
    })
    .onConflictDoNothing()
    .returning();

  if (account) {
    resolvedAccountId = account.id;
  } else {
    const existing = await db.query.accounts.findFirst({
      where: (a, { eq: eqFn }) => eqFn(a.name, company.name),
    });
    if (!existing) throw new Error("Account save failed");
    resolvedAccountId = existing.id;
  }

  const savedLeads: SaveLeadsResult["saved"] = [];
  const skipped: SaveLeadsResult["skipped"] = [];

  for (const person of people) {
    let resolvedEmail = sanitizeEmail(person.email);
    let resolvedPhone = person.phone;
    let emailConfidence = 0;
    let enrichmentSource: string | undefined;
    let enrichmentProvider: string | undefined;
    let enrichAttempts: unknown;
    let resolvedTitle = person.title;

    if (shouldEnrich) {
      const enriched = await enrichPersonContact({
        person: {
          ...person,
          email: resolvedEmail && isGenericCompanyEmail(resolvedEmail) ? undefined : person.email,
        },
        company,
        mode: enrichMode,
        dataMode: cfg.dataMode,
        enrichProvider: cfg.enrichProvider,
      });
      enrichAttempts = enriched.attempts;
      const named = isNamedPerson(person.name);
      resolvedTitle = enriched.title ?? person.title;
      if (
        enriched.email &&
        shouldAutoAcceptEmail(enriched.emailConfidence, enriched.email, { namedPerson: named })
      ) {
        resolvedEmail = enriched.email;
        resolvedPhone = enriched.phone ?? resolvedPhone;
        emailConfidence = enriched.emailConfidence;
        enrichmentSource = enriched.enrichmentSource;
        enrichmentProvider = enriched.enrichmentProvider;
      } else if (enriched.email && !named) {
        emailConfidence = enriched.emailConfidence;
        enrichmentSource = enriched.enrichmentSource;
        enrichmentProvider = enriched.enrichmentProvider;
      } else if (resolvedEmail && isGenericCompanyEmail(resolvedEmail) && named) {
        resolvedEmail = undefined;
      }
    } else if (resolvedEmail && isGenericCompanyEmail(resolvedEmail) && isNamedPerson(person.name)) {
      resolvedEmail = undefined;
    }

    const emailResult = await verifyEmail(resolvedEmail ?? "");

    await db.insert(enrichmentRuns).values({
      provider: enrichmentProvider ?? person.dataSource,
      dataMode,
      success: true,
      emailFound: !!resolvedEmail,
      emailVerified: emailResult.status === "verified",
      result: {
        email: resolvedEmail,
        emailStatus: emailResult.status,
        confidence: emailConfidence,
        attempts: enrichAttempts,
      },
    });

    if (emailResult.status === "missing" && !normalizeLinkedInUrl(person.linkedIn)) {
      skipped.push({ name: person.name, reason: "no email or LinkedIn profile" });
      continue;
    }

    const existingByEmail = resolvedEmail
      ? await db.query.contacts.findFirst({
          where: and(eq(contacts.email, resolvedEmail), eq(contacts.tenantId, tenantId)),
        })
      : null;

    const existingByName = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.name, person.name),
        eq(contacts.accountId, resolvedAccountId),
        eq(contacts.tenantId, tenantId),
      ),
    });

    const existingContact = existingByEmail ?? existingByName;

    const filter = await preFilterCheck(person, company, leadSource);
    if (!filter.pass) {
      skipped.push({ name: person.name, reason: `pre-filter rejected: ${filter.reason}` });
      continue;
    }

    let contactId: string;

    if (existingContact) {
      await db
        .update(contacts)
        .set({
          title: resolvedTitle ?? existingContact.title,
          email: resolvedEmail ?? existingContact.email,
          emailStatus: emailResult.status,
          emailConfidence: emailConfidence || existingContact.emailConfidence,
          enrichmentSource: enrichmentSource ?? existingContact.enrichmentSource,
          enrichmentProvider: enrichmentProvider ?? existingContact.enrichmentProvider,
          phone: resolvedPhone ?? existingContact.phone,
          linkedIn: normalizeLinkedInUrl(person.linkedIn) ?? existingContact.linkedIn,
          matchScore: person.matchScore ?? existingContact.matchScore,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, existingContact.id));
      contactId = existingContact.id;

      const [existingLead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.contactId, existingContact.id), eq(leads.tenantId, tenantId)))
        .orderBy(desc(leads.createdAt))
        .limit(1);

      if (existingLead) {
        savedLeads.push({
          leadId: existingLead.id,
          name: person.name,
          emailStatus: emailResult.status,
        });
        continue;
      }
    } else {
      const [contact] = await db
        .insert(contacts)
        .values({
          tenantId,
          workspaceId,
          accountId: resolvedAccountId,
          name: person.name,
          firstName: person.firstName,
          lastName: person.lastName,
          title: resolvedTitle ?? person.title,
          department: person.department,
          seniority: person.seniority,
          email: resolvedEmail ?? null,
          emailStatus: emailResult.status,
          emailConfidence: emailConfidence || null,
          enrichmentSource: enrichmentSource ?? null,
          enrichmentProvider: enrichmentProvider ?? null,
          phone: resolvedPhone,
          linkedIn: normalizeLinkedInUrl(person.linkedIn),
          bio: person.bio,
          isKeyDM: person.isKeyDM ?? false,
          matchScore: person.matchScore,
          engagementSignals: person.engagementSignals ?? [],
          dataSource: person.dataSource,
          externalId: person.externalId,
        })
        .onConflictDoNothing()
        .returning();

      if (!contact) {
        skipped.push({ name: person.name, reason: "contact already exists" });
        continue;
      }
      contactId = contact.id;
    }

    const [lead] = await db
      .insert(leads)
      .values({
        tenantId,
        workspaceId,
        contactId,
        accountId: resolvedAccountId,
        campaignId: DEFAULT_CAMPAIGN,
        status: "scouted",
        score: person.matchScore,
        leadSource,
        researcherEligible: filter.pass,
        tags: ["Lead", "Gifting Signal"],
      })
      .returning();

    if (!lead) continue;

    await db.insert(yieldFunnel).values({ leadId: lead.id, stage: "scouted" });
    await db.insert(yieldFunnel).values({
      leadId: lead.id,
      stage: "prefiltered",
      metadata: { reason: filter.reason },
    });

    await logAudit({
      tenantId,
      workspaceId,
      action: "lead.saved",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        contactName: person.name,
        company: company.name,
        emailStatus: emailResult.status,
        emailConfidence,
        source: leadSource,
        reusedContact: Boolean(existingContact),
      },
    });

    savedLeads.push({ leadId: lead.id, name: person.name, emailStatus: emailResult.status });
  }

  if (savedLeads.length > 0) {
    void enqueueResearchForLeads(savedLeads.map((s) => s.leadId));
  }

  return { saved: savedLeads, skipped };
}
