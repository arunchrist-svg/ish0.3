import { db, accounts, contacts, leads, yieldFunnel, enrichmentRuns } from "@/db";
import { verifyEmail } from "@/lib/enrichment/verify";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { logAudit } from "@/lib/audit";
import { callLLM } from "@/lib/llm";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { eq, and } from "drizzle-orm";
import {
  enrichPersonContact,
  shouldEnrichOnImport,
  shouldAutoAcceptEmail,
  isNamedPerson,
} from "@/lib/enrichment/enrich-lead";
import { isGenericCompanyEmail, sanitizeEmail } from "@/lib/enrichment/validate-contact";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";
const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";

async function preFilterCheck(
  person: ScoutPersonResult,
  company: ScoutCompanyResult,
): Promise<{ pass: boolean; reason: string }> {
  try {
    const raw = await callLLM({
      tier: "fast",
      system: `You are a B2B lead relevance classifier for a corporate gifting company (India Sweet House).
Output ONLY valid JSON: { "pass": boolean, "reason": string }
Pass = true if the company is a real, current Indian company that buys corporate gifts for employees (100+ employees, active business).
Pass = false if: foreign company, very small (<50 employees), irrelevant industry, or clearly hallucinated.`,
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
}): Promise<SaveLeadsResult> {
  const { people, company } = params;
  const dataMode = (params.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
  const leadSource = params.leadSource ?? "scout";
  const enrichOnImport = shouldEnrichOnImport();

  let resolvedAccountId: string;
  const [account] = await db
    .insert(accounts)
    .values({
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      name: company.name,
      domain: company.domain,
      website: company.website,
      industry: company.industry,
      city: company.city,
      employees: company.employees,
      logo: company.logo,
      giftScore: company.giftScore,
      giftBudget: company.giftBudget,
      intelNotes: company.intelNotes,
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

    const needsEnrich =
      enrichOnImport &&
      (!resolvedEmail || !person.title?.trim() || (resolvedEmail && isGenericCompanyEmail(resolvedEmail) && isNamedPerson(person.name)));

    if (needsEnrich) {
      const enriched = await enrichPersonContact({
        person: {
          ...person,
          email: resolvedEmail && isGenericCompanyEmail(resolvedEmail) ? undefined : person.email,
        },
        company,
        mode: "free",
        dataMode,
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
      ? await db.query.contacts.findFirst({ where: eq(contacts.email, resolvedEmail) })
      : null;
    if (existingByEmail) {
      skipped.push({ name: person.name, reason: "email already in CRM" });
      continue;
    }

    const existingByName = await db.query.contacts.findFirst({
      where: and(eq(contacts.name, person.name), eq(contacts.accountId, resolvedAccountId)),
    });
    if (existingByName) {
      skipped.push({ name: person.name, reason: "already scouted" });
      continue;
    }

    const filter = await preFilterCheck(person, company);
    if (!filter.pass) {
      skipped.push({ name: person.name, reason: `pre-filter rejected: ${filter.reason}` });
      continue;
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        tenantId: DEFAULT_TENANT,
        workspaceId: DEFAULT_WORKSPACE,
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

    const [lead] = await db
      .insert(leads)
      .values({
        tenantId: DEFAULT_TENANT,
        workspaceId: DEFAULT_WORKSPACE,
        contactId: contact.id,
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
      tenantId: DEFAULT_TENANT,
      workspaceId: DEFAULT_WORKSPACE,
      action: "lead.saved",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        contactName: person.name,
        company: company.name,
        emailStatus: emailResult.status,
        emailConfidence,
        source: leadSource,
      },
    });

    savedLeads.push({ leadId: lead.id, name: person.name, emailStatus: emailResult.status });
  }

  return { saved: savedLeads, skipped };
}
