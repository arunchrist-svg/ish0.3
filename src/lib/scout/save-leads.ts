import { db, accounts, contacts, leads, yieldFunnel, enrichmentRuns } from "@/db";
import { verifyEmail } from "@/lib/enrichment/verify";
import type { EmailVerifyResult } from "@/lib/enrichment/types";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { logScoutQualityEvent, matchScoreBand, SCOUT_QUALITY_EVENT } from "@/lib/scout/quality-events";
import { enqueueEnrichLead, enqueueResearchForLeads } from "@/lib/jobs/enqueue";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { eq, and, desc, or, ilike } from "drizzle-orm";
import { pickMatchingAccount, uniqueScoutCompanies } from "@/lib/scout/account-match";
import {
  enrichPersonContact,
  shouldAutoAcceptEmail,
  isNamedPerson,
} from "@/lib/enrichment/enrich-lead";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { searchProviderUsesTavily } from "@/lib/enrichment/config";
import { enrichModeForSettings } from "@/lib/enrichment/provider-config";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { isGenericCompanyEmail, sanitizeEmail, sanitizePhone, resolveSavedWhatsAppPhone } from "@/lib/enrichment/validate-contact";
import {
  emailBelongsToCompany,
  isAcceptableCompanyDomain,
  isKeepableContactEmail,
  usableStoredDomain,
} from "@/lib/enrichment/company-domain-quality";
import { normalizeDomain, resolveCompanyDomain } from "@/lib/enrichment/resolve-company-domain";
import { resolveContactName } from "@/lib/enrichment/email-permutations";
import { refreshPermutationEmails, toDbEmailStatus } from "@/lib/enrichment/contact-emails";
import { sanitizeJobTitle } from "@/lib/enrichment/job-title";
import {
  hasFormerCompanyAffiliation,
  isOpenToWorkProfile,
  personLooksOpenToWork,
  personTitleConflictsWithCompany,
  personFieldsShowCurrentEmployment,
  entityTokens,
  isWeakCompanyPrefix,
} from "@/lib/enrichment/person-company-match";
import { isFestivalBuyerRole } from "@/lib/enrichment/people-role-filter";
import type { ContactEmailEntry } from "@/lib/enrichment/contact-emails";
import { isPlantSeatScout, seatAllowedOnSave } from "@/lib/scout/plant-seat";
import { mapWithConcurrency } from "@/lib/async";

const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";
/** Wizard saves should feel instant; enrichment runs in the background. */
const SAVE_PERSON_CONCURRENCY = 8;

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
  "cto",
  "cmo",
  "people",
  "facilities",
  "office",
  "sales",
  "operations",
];

function companyNeedsEmployerVerify(companyName: string, matchScore?: number): boolean {
  if (matchScore != null && matchScore < 35) return true;
  const tokens = entityTokens(companyName);
  return tokens.length >= 2 && tokens.some((token) => isWeakCompanyPrefix(token));
}

function looksLikeDecisionMaker(person: ScoutPersonResult): boolean {
  if (person.isKeyDM) return true;
  const title = (person.title ?? "").toLowerCase();
  return BUYING_TITLE_KEYWORDS.some((keyword) => title.includes(keyword));
}

export function scoutPersonSaveGate(
  person: ScoutPersonResult,
  company: ScoutCompanyResult,
  opts?: {
    leadSource?: string;
    sweetsGifting?: boolean;
    /** Plant-town scout cities (e.g. Ramanagara). Used to allow Nearby HQ and block Delhi. */
    plantCities?: string[];
  },
): { pass: boolean; reason: string } {
  // Open to Work and former-employee checks run for every source, including the wizard:
  // a job seeker must never become a lead just because the user ticked the box.
  const blob = `${person.name ?? ""}\n${person.title ?? ""}\n${person.bio ?? ""}`;
  if (personLooksOpenToWork(person) || isOpenToWorkProfile(blob)) {
    return { pass: false, reason: "open to work profile" };
  }
  if (hasFormerCompanyAffiliation(blob, company.name)) {
    return { pass: false, reason: "does not work at this company" };
  }

  if (companyNeedsEmployerVerify(company.name, person.matchScore)) {
    if (!personFieldsShowCurrentEmployment(person, company.name)) {
      return { pass: false, reason: "employer verify failed" };
    }
  }

  const plantCities = (opts?.plantCities ?? []).map((c) => c.trim()).filter(Boolean);
  if (plantCities.length && isPlantSeatScout(plantCities) && person.location?.trim()) {
    const seat = person.seat === "plant" || person.seat === "nearby_hq" ? person.seat : "nearby_hq";
    if (!seatAllowedOnSave({ seat, location: person.location, plantCities })) {
      return { pass: false, reason: "outside plant city or nearby HQ corridor" };
    }
  }

  if (opts?.leadSource === "scout_wizard") {
    return { pass: true, reason: "user-selected from scout wizard" };
  }

  if (personTitleConflictsWithCompany(person.title, company.name)) {
    return { pass: false, reason: "does not work at this company" };
  }

  if (opts?.sweetsGifting) {
    if (!person.name?.trim()) {
      return { pass: false, reason: "missing contact name" };
    }
    if (!person.title?.trim() || !isFestivalBuyerRole(person.title)) {
      return { pass: false, reason: "not a festival sweets buyer" };
    }
    return { pass: true, reason: "festival sweets buyer role" };
  }

  if (looksLikeDecisionMaker(person)) {
    return { pass: true, reason: "decision-maker title match" };
  }

  // SaaS scout: accept named contacts without a gifting-relevance LLM round-trip.
  if (person.name?.trim()) {
    return { pass: true, reason: "named contact" };
  }

  return { pass: false, reason: "missing contact name" };
}

async function preFilterCheck(
  person: ScoutPersonResult,
  company: ScoutCompanyResult,
  leadSource?: string,
  sweetsGifting?: boolean,
  plantCities?: string[],
): Promise<{ pass: boolean; reason: string }> {
  return scoutPersonSaveGate(person, company, { leadSource, sweetsGifting, plantCities });
}

export type SaveLeadsResult = {
  saved: { leadId: string; name: string; emailStatus: string }[];
  skipped: { name: string; reason: string }[];
  accountId?: string;
  companySaved?: boolean;
};

export type SaveScoutCompaniesResult = {
  saved: number;
  accounts: { id: string; name: string }[];
};

type AccountRow = typeof accounts.$inferSelect;

type PersonSaveOutcome =
  | { kind: "saved"; item: SaveLeadsResult["saved"][number] }
  | { kind: "skipped"; item: SaveLeadsResult["skipped"][number] }
  | { kind: "none" };

async function loadWorkspaceAccountCandidates(
  tenantId: string,
  workspaceId: string,
): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.workspaceId, workspaceId)))
    .limit(500);
}

async function findExistingAccount(
  tenantId: string,
  workspaceId: string,
  company: ScoutCompanyResult,
  candidates?: AccountRow[],
): Promise<AccountRow | undefined> {
  const pool =
    candidates ??
    (await (async () => {
      const domain = usableStoredDomain(company.domain, company.name);
      const matchers = [
        ...(domain ? [eq(accounts.domain, domain)] : []),
        ...(company.name.trim() ? [ilike(accounts.name, company.name.trim())] : []),
      ];
      if (!matchers.length) return [] as AccountRow[];
      return db
        .select()
        .from(accounts)
        .where(
          and(
            eq(accounts.tenantId, tenantId),
            eq(accounts.workspaceId, workspaceId),
            or(...matchers),
          ),
        )
        .limit(100);
    })());

  return pickMatchingAccount(pool, company);
}

async function upsertScoutAccount(params: {
  company: ScoutCompanyResult;
  tenantId: string;
  workspaceId: string;
  skipExternalDomain?: boolean;
  allowExternal?: boolean;
  allowTavily?: boolean;
  candidates?: AccountRow[];
}): Promise<{ account: AccountRow; created: boolean; resolvedCompany: ScoutCompanyResult }> {
  const {
    company,
    tenantId,
    workspaceId,
    skipExternalDomain = false,
    allowExternal = true,
    allowTavily = true,
    candidates,
  } = params;
  const usableDomain = usableStoredDomain(company.domain, company.name);

  let resolvedCompany: ScoutCompanyResult = {
    ...company,
    domain: usableDomain ?? undefined,
  };

  // Fast path: keep a known-good domain without Apollo/Tavily.
  if (usableDomain) {
    resolvedCompany = {
      ...company,
      domain: usableDomain,
      website: company.website ?? `https://www.${usableDomain}`,
    };
  } else if (!skipExternalDomain && allowExternal) {
    const domainResolution = await resolveCompanyDomain({
      companyName: company.name,
      domain: company.domain,
      website: company.website,
      city: company.city,
      allowExternal: true,
      allowTavily,
    });
    resolvedCompany = {
      ...company,
      domain: usableStoredDomain(domainResolution.domain, company.name) ?? undefined,
      website: domainResolution.website ?? company.website,
    };
  } else {
    // Company-only save still applies curated name→domain overrides (no Apollo/Tavily).
    const knownResolution = await resolveCompanyDomain({
      companyName: company.name,
      domain: company.domain,
      website: company.website,
      city: company.city,
      allowExternal: false,
    });
    const knownDomain = usableStoredDomain(knownResolution.domain, company.name);
    if (knownDomain) {
      resolvedCompany = {
        ...company,
        domain: knownDomain,
        website: knownResolution.website ?? company.website,
      };
    }
  }

  const existing = await findExistingAccount(tenantId, workspaceId, resolvedCompany, candidates);
  if (existing) {
    await db
      .update(accounts)
      .set({
        domain:
          usableStoredDomain(existing.domain, resolvedCompany.name) ??
          usableStoredDomain(resolvedCompany.domain, resolvedCompany.name),
        website: isAcceptableCompanyDomain(
          normalizeDomain(existing.website) ?? existing.domain,
          resolvedCompany.name,
        )
          ? existing.website
          : resolvedCompany.website ?? null,
        industry: existing.industry ?? resolvedCompany.industry ?? null,
        city: existing.city ?? resolvedCompany.city ?? null,
        employees: existing.employees ?? resolvedCompany.employees ?? null,
        scaleStatus:
          existing.scaleStatus === "verified"
            ? existing.scaleStatus
            : resolvedCompany.scaleStatus ?? existing.scaleStatus ?? null,
        scaleSource:
          existing.scaleStatus === "verified"
            ? existing.scaleSource
            : resolvedCompany.scaleSource ?? existing.scaleSource ?? null,
        scaleEvidence:
          existing.scaleStatus === "verified"
            ? existing.scaleEvidence
            : resolvedCompany.scaleEvidence ?? existing.scaleEvidence ?? null,
        logo: existing.logo ?? resolvedCompany.logo ?? null,
        intelNotes: existing.intelNotes ?? resolvedCompany.intelNotes ?? null,
        fitScore: existing.fitScore ?? resolvedCompany.fitScore ?? null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, existing.id));
    return { account: existing, created: false, resolvedCompany };
  }

  const [account] = await db
    .insert(accounts)
    .values({
      tenantId,
      workspaceId,
      name: resolvedCompany.name,
      domain: usableStoredDomain(resolvedCompany.domain, resolvedCompany.name),
      website: resolvedCompany.website,
      industry: resolvedCompany.industry,
      city: resolvedCompany.city,
      employees: resolvedCompany.employees,
      scaleStatus: resolvedCompany.scaleStatus,
      scaleSource: resolvedCompany.scaleSource,
      scaleEvidence: resolvedCompany.scaleEvidence,
      logo: resolvedCompany.logo,
      fitScore: resolvedCompany.fitScore,
      budgetBand: resolvedCompany.budgetBand,
      revenue: resolvedCompany.revenue,
      pastGifting: resolvedCompany.pastGifting ?? [],
      intelNotes: resolvedCompany.intelNotes,
      companyOverview: resolvedCompany.companyOverview ?? null,
      dataSource: resolvedCompany.dataSource || "scout",
      externalId: resolvedCompany.externalId,
    })
    .returning();

  if (!account) throw new Error("Account save failed");
  return { account, created: true, resolvedCompany };
}

export async function saveScoutCompanies(params: {
  companies: ScoutCompanyResult[];
  tenantId: string;
  workspaceId: string;
}): Promise<SaveScoutCompaniesResult> {
  const unique = uniqueScoutCompanies(params.companies);
  const candidates = await loadWorkspaceAccountCandidates(params.tenantId, params.workspaceId);
  const cfg = await getResolvedWorkspaceEnrichmentConfig();
  const savedAccounts: { id: string; name: string }[] = [];

  for (const company of unique) {
    const { account, created } = await upsertScoutAccount({
      company,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      skipExternalDomain: true,
      allowExternal: cfg.searchProvider !== "google_places",
      allowTavily: searchProviderUsesTavily(cfg.searchProvider),
      candidates,
    });
    if (created) candidates.push(account);
    savedAccounts.push({ id: account.id, name: account.name });
  }

  if (savedAccounts.length > 0) {
    await logAudit({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      action: "accounts.saved",
      entityType: "account",
      entityId: savedAccounts[0]!.id,
      metadata: { count: savedAccounts.length, source: "scout" },
    });
  }

  return { saved: savedAccounts.length, accounts: savedAccounts };
}

export function accountToScoutCompany(row: AccountRow): ScoutCompanyResult {
  return {
    name: row.name,
    domain: row.domain ?? undefined,
    website: row.website ?? undefined,
    industry: row.industry ?? undefined,
    city: row.city ?? undefined,
    employees: row.employees ?? undefined,
    scaleStatus: row.scaleStatus as ScoutCompanyResult["scaleStatus"] | undefined,
    scaleSource: row.scaleSource as ScoutCompanyResult["scaleSource"] | undefined,
    scaleEvidence: row.scaleEvidence ?? undefined,
    logo: row.logo ?? undefined,
    fitScore: row.fitScore ?? undefined,
    budgetBand: row.budgetBand ?? undefined,
    revenue: row.revenue ?? undefined,
    intelNotes: row.intelNotes ?? undefined,
    dataSource: row.dataSource || "scout",
    externalId: row.id,
  };
}

export async function listTenantAccountShapes(params: {
  tenantId: string;
  workspaceId: string;
  limit?: number;
}): Promise<{ name: string; city?: string | null; domain?: string | null }[]> {
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 500);
  const rows = await db
    .select({
      name: accounts.name,
      city: accounts.city,
      domain: accounts.domain,
      dataSource: accounts.dataSource,
    })
    .from(accounts)
    .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.workspaceId, params.workspaceId)))
    .orderBy(desc(accounts.updatedAt))
    .limit(limit);

  return rows
    .filter((row) => (row.dataSource ?? "").toLowerCase() !== "sample")
    .map((row) => ({
      name: row.name,
      city: row.city,
      domain: row.domain,
    }));
}

export async function listSavedScoutCompanies(params: {
  tenantId: string;
  workspaceId: string;
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.tenantId, params.tenantId), eq(accounts.workspaceId, params.workspaceId)))
    .orderBy(desc(accounts.updatedAt))
    .limit(limit);

  return rows
    .filter((row) => (row.dataSource ?? "").toLowerCase() !== "sample")
    .map(accountToScoutCompany);
}

async function resolveEmailStatus(params: {
  email?: string;
  enrichedEmail?: string;
  enrichedStatus?: EnrichContactResultStatus;
  didEnrich: boolean;
}): Promise<EmailVerifyResult> {
  const email = params.email ?? "";
  if (
    params.didEnrich &&
    params.enrichedEmail &&
    params.email &&
    params.enrichedEmail.toLowerCase() === params.email.toLowerCase() &&
    params.enrichedStatus
  ) {
    return {
      email: params.email,
      status: params.enrichedStatus,
      isPersonal: params.enrichedStatus !== "generic" && params.enrichedStatus !== "missing",
      provider: "enrich-reuse",
    };
  }
  return verifyEmail(email, { network: false });
}

type EnrichContactResultStatus = "verified" | "unverified" | "generic" | "missing";

export async function saveScoutLeads(params: {
  people: ScoutPersonResult[];
  company: ScoutCompanyResult;
  dataMode?: DataMode;
  leadSource?: string;
  tenantId: string;
  workspaceId: string;
  createdByUserId?: string;
  enrichmentConfig?: EnrichmentConfig;
  sweetsGifting?: boolean;
  plantCities?: string[];
}): Promise<SaveLeadsResult> {
  const { people, company, tenantId, workspaceId, createdByUserId } = params;

  if (!people.length) {
    const { account } = await upsertScoutAccount({
      company,
      tenantId,
      workspaceId,
      skipExternalDomain: true,
    });
    return { saved: [], skipped: [], accountId: account.id, companySaved: true };
  }

  const dataMode = (params.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
  const leadSource = params.leadSource ?? "scout";
  const cfg =
    params.enrichmentConfig ??
    (await getResolvedWorkspaceEnrichmentConfig({ dataMode }));
  const shouldEnrich = cfg.enrichOnImport && cfg.enrichProvider !== "none";
  const enrichMode = enrichModeForSettings(cfg.enrichProvider, cfg.dataMode);
  const skipGooglePlaces = leadSource === "scout_wizard";
  const sweetsGifting = params.sweetsGifting ?? false;
  // Scout UI already resolved domains during people fetch. Do not re-hit Apollo/Tavily on save.
  // Paid email enrichment is deferred so "Add as Leads" returns after DB writes only.
  const isWizard = leadSource === "scout_wizard";
  const deferEnrich = isWizard && shouldEnrich && enrichMode === "paid";
  const runSyncEnrich = shouldEnrich && enrichMode === "paid" && !deferEnrich;

  const { account, resolvedCompany } = await upsertScoutAccount({
    company,
    tenantId,
    workspaceId,
    skipExternalDomain: isWizard,
    allowExternal: cfg.searchProvider !== "google_places",
    allowTavily: searchProviderUsesTavily(cfg.searchProvider),
  });
  const resolvedAccountId = account.id;

  const outcomes = await mapWithConcurrency(people, SAVE_PERSON_CONCURRENCY, async (person) => {
    return saveOnePerson({
      person,
      resolvedCompany,
      resolvedAccountId,
      tenantId,
      workspaceId,
      dataMode,
      leadSource,
      shouldEnrich: runSyncEnrich,
      enrichMode,
      cfg,
      skipGooglePlaces,
      sweetsGifting,
      createdByUserId,
      plantCities: params.plantCities,
    });
  });

  const savedLeads: SaveLeadsResult["saved"] = [];
  const skipped: SaveLeadsResult["skipped"] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === "saved") savedLeads.push(outcome.item);
    else if (outcome.kind === "skipped") skipped.push(outcome.item);
  }

  for (const item of skipped) {
    void logScoutQualityEvent({
      tenantId,
      workspaceId,
      userId: createdByUserId,
      eventType: SCOUT_QUALITY_EVENT.leadSkipped,
      metadata: { name: item.name, reason: item.reason, company: company.name, leadSource },
    });
  }
  for (const item of savedLeads) {
    const person = people.find((p) => p.name === item.name);
    void logScoutQualityEvent({
      tenantId,
      workspaceId,
      userId: createdByUserId,
      eventType: SCOUT_QUALITY_EVENT.leadSaved,
      metadata: {
        name: item.name,
        company: company.name,
        leadSource,
        matchScoreBand: matchScoreBand(person?.matchScore),
      },
    });
  }

  if (savedLeads.length > 0) {
    void enqueueResearchForLeads(savedLeads.map((s) => s.leadId));
  }

  if (deferEnrich && savedLeads.length > 0) {
    for (const item of savedLeads) {
      if (item.emailStatus === "verified" || item.emailStatus === "unverified") continue;
      void enqueueEnrichLead({
        leadId: item.leadId,
        tenantId,
        mode: enrichMode,
        dataMode: cfg.dataMode,
      });
    }
  }

  return { saved: savedLeads, skipped, accountId: resolvedAccountId };
}

async function saveOnePerson(params: {
  person: ScoutPersonResult;
  resolvedCompany: ScoutCompanyResult;
  resolvedAccountId: string;
  tenantId: string;
  workspaceId: string;
  dataMode: DataMode;
  leadSource: string;
  shouldEnrich: boolean;
  enrichMode: "free" | "paid";
  cfg: EnrichmentConfig;
  skipGooglePlaces: boolean;
  sweetsGifting?: boolean;
  createdByUserId?: string;
  plantCities?: string[];
}): Promise<PersonSaveOutcome> {
  const {
    person,
    resolvedCompany,
    resolvedAccountId,
    tenantId,
    workspaceId,
    dataMode,
    leadSource,
    shouldEnrich,
    enrichMode,
    cfg,
    skipGooglePlaces,
    sweetsGifting,
    createdByUserId,
    plantCities,
  } = params;

  if (personTitleConflictsWithCompany(person.title, resolvedCompany.name)) {
    return {
      kind: "skipped",
      item: {
        name: person.name,
        reason: sweetsGifting ? "does not work at this company" : "title names a different employer",
      },
    };
  }

  const filter = await preFilterCheck(person, resolvedCompany, leadSource, sweetsGifting, plantCities);
  if (!filter.pass) {
    return {
      kind: "skipped",
      item: { name: person.name, reason: `pre-filter rejected: ${filter.reason}` },
    };
  }

  let resolvedEmail = sanitizeEmail(person.email);
  const hasLinkedIn = Boolean(normalizeLinkedInUrl(person.linkedIn));
  const emailFitsCompany = (email: string) =>
    hasLinkedIn
      ? isKeepableContactEmail(email, resolvedCompany.name)
      : emailBelongsToCompany(email, resolvedCompany.name);
  if (resolvedEmail && !emailFitsCompany(resolvedEmail)) {
    resolvedEmail = undefined;
  }
  let resolvedPhone = sanitizePhone(person.phone);
  let emailConfidence = 0;
  let enrichmentSource: string | undefined;
  let enrichmentProvider: string | undefined;
  let enrichAttempts: unknown;
  let resolvedTitle = sanitizeJobTitle(person.title);
  let enrichedEmailStatus: EnrichContactResultStatus | undefined;
  let enrichedAcceptedEmail: string | undefined;
  let didEnrich = false;

  const emailAlreadyReady =
    Boolean(resolvedEmail) &&
    !isGenericCompanyEmail(resolvedEmail!) &&
    emailFitsCompany(resolvedEmail!);

  // Fast CRM add:
  // - keepable email already present → skip providers
  // - free mode → skip Apollo/Hunter/website waterfall (permutation fill is enough)
  // Paid enrich still runs when Settings use a paid provider and email is missing
  // (scout wizard defers this to background via enqueueEnrichLead).
  if (shouldEnrich && enrichMode === "paid" && !emailAlreadyReady) {
    const enriched = await enrichPersonContact({
      person: {
        ...person,
        email: resolvedEmail && isGenericCompanyEmail(resolvedEmail) ? undefined : person.email,
      },
      company: resolvedCompany,
      mode: enrichMode,
      dataMode: cfg.dataMode,
      enrichProvider: cfg.enrichProvider,
      skipGooglePlaces,
    });
    didEnrich = true;
    enrichAttempts = enriched.attempts;
    const named = isNamedPerson(person.name);
    resolvedTitle = sanitizeJobTitle(enriched.title) ?? sanitizeJobTitle(person.title);
    const linkedInProviderHit =
      hasLinkedIn &&
      (enriched.enrichmentProvider === "prospeo" ||
        enriched.enrichmentProvider === "hunter" ||
        enriched.enrichmentProvider === "apollo");
    if (
      enriched.email &&
      emailFitsCompany(enriched.email) &&
      (shouldAutoAcceptEmail(enriched.emailConfidence, enriched.email, { namedPerson: named }) ||
        (linkedInProviderHit && !isGenericCompanyEmail(enriched.email)))
    ) {
      resolvedEmail = enriched.email;
      emailConfidence = enriched.emailConfidence;
      enrichmentSource = enriched.enrichmentSource;
      enrichmentProvider = enriched.enrichmentProvider;
      enrichedEmailStatus = enriched.emailStatus;
      enrichedAcceptedEmail = enriched.email;
    } else if (enriched.email && !named) {
      emailConfidence = enriched.emailConfidence;
      enrichmentSource = enriched.enrichmentSource;
      enrichmentProvider = enriched.enrichmentProvider;
      enrichedEmailStatus = enriched.emailStatus;
      enrichedAcceptedEmail = enriched.email;
    } else if (resolvedEmail && isGenericCompanyEmail(resolvedEmail) && named) {
      resolvedEmail = undefined;
    } else if (enriched.email && enriched.email === resolvedEmail) {
      enrichedEmailStatus = enriched.emailStatus;
      enrichedAcceptedEmail = enriched.email;
    }
    const mobile = resolveSavedWhatsAppPhone(resolvedPhone, enriched.phone);
    if (mobile) resolvedPhone = mobile;
  } else if (resolvedEmail && isGenericCompanyEmail(resolvedEmail) && isNamedPerson(person.name)) {
    resolvedEmail = undefined;
  }

  if (resolvedTitle && personTitleConflictsWithCompany(resolvedTitle, resolvedCompany.name)) {
    resolvedTitle = undefined;
  }

  const emailResult = await resolveEmailStatus({
    email: resolvedEmail,
    enrichedEmail: enrichedAcceptedEmail,
    enrichedStatus: enrichedEmailStatus,
    didEnrich,
  });

  if (didEnrich || resolvedEmail) {
    void db.insert(enrichmentRuns).values({
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
  }

  if (emailResult.status === "missing" && !normalizeLinkedInUrl(person.linkedIn)) {
    return { kind: "skipped", item: { name: person.name, reason: "no email or LinkedIn profile" } };
  }

  const [existingByEmail, existingByName] = await Promise.all([
    resolvedEmail
      ? db.query.contacts.findFirst({
          where: and(eq(contacts.email, resolvedEmail), eq(contacts.tenantId, tenantId)),
        })
      : Promise.resolve(null),
    db.query.contacts.findFirst({
      where: and(
        eq(contacts.name, person.name),
        eq(contacts.accountId, resolvedAccountId),
        eq(contacts.tenantId, tenantId),
      ),
    }),
  ]);

  const existingContact = existingByEmail ?? existingByName;

  let contactId: string;

  const { firstName: resolvedFirstName, lastName: resolvedLastName } = resolveContactName({
    firstName: person.firstName,
    lastName: person.lastName,
    name: person.name,
  });

  const secondaryIdentity = {
    firstName: resolvedFirstName,
    lastName: resolvedLastName,
    name: person.name,
    domain: resolvedCompany.domain,
    website: resolvedCompany.website,
    companyName: resolvedCompany.name,
  };

  if (existingContact) {
    const nextEmail =
      resolvedEmail ??
      (existingContact.email && emailFitsCompany(existingContact.email)
        ? existingContact.email
        : undefined);
    const refreshed = refreshPermutationEmails({
      ...secondaryIdentity,
      primaryEmail: nextEmail,
      emailStatus: emailResult.status,
      enrichmentProvider: enrichmentSource ? enrichmentProvider : existingContact.enrichmentProvider,
      enrichmentSource: enrichmentSource ?? existingContact.enrichmentSource,
      alternateEmails: (existingContact.alternateEmails as ContactEmailEntry[] | null) ?? [],
      // LinkedIn without a confirmed email must not become a fake first.last@domain primary.
      fillPermutationPrimary: !(hasLinkedIn && !resolvedEmail),
    });
    await db
      .update(contacts)
      .set({
        title: resolvedTitle ?? existingContact.title,
        firstName: existingContact.firstName || resolvedFirstName || null,
        lastName: existingContact.lastName || resolvedLastName || null,
        email: refreshed.email,
        emailStatus: toDbEmailStatus(refreshed.emailStatus),
        emailConfidence: emailConfidence || existingContact.emailConfidence,
        enrichmentSource: refreshed.enrichmentSource,
        enrichmentProvider: refreshed.enrichmentProvider,
        alternateEmails: refreshed.alternateEmails,
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
      return {
        kind: "saved",
        item: {
          leadId: existingLead.id,
          name: person.name,
          emailStatus: emailResult.status,
        },
      };
    }
  } else {
    const refreshed = refreshPermutationEmails({
      ...secondaryIdentity,
      primaryEmail: resolvedEmail,
      emailStatus: emailResult.status,
      enrichmentProvider,
      enrichmentSource,
      alternateEmails: [],
      fillPermutationPrimary: !(hasLinkedIn && !resolvedEmail),
    });
    const [contact] = await db
      .insert(contacts)
      .values({
        tenantId,
        workspaceId,
        accountId: resolvedAccountId,
        name: person.name,
        firstName: resolvedFirstName || person.firstName || null,
        lastName: resolvedLastName || person.lastName || null,
        title:
          resolvedTitle && personTitleConflictsWithCompany(resolvedTitle, resolvedCompany.name)
            ? null
            : resolvedTitle ?? person.title,
        department: person.department,
        seniority: person.seniority,
        email: refreshed.email,
        emailStatus: toDbEmailStatus(refreshed.emailStatus),
        emailConfidence: emailConfidence || null,
        enrichmentSource: refreshed.enrichmentSource,
        enrichmentProvider: refreshed.enrichmentProvider,
        alternateEmails: refreshed.alternateEmails,
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
      return { kind: "skipped", item: { name: person.name, reason: "contact already exists" } };
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
      tags: ["Lead", "Scout"],
      createdByUserId: createdByUserId ?? null,
    })
    .returning();

  if (!lead) return { kind: "none" };

  await Promise.all([
    db.insert(yieldFunnel).values({ leadId: lead.id, stage: "scouted" }),
    db.insert(yieldFunnel).values({
      leadId: lead.id,
      stage: "prefiltered",
      metadata: { reason: filter.reason },
    }),
  ]);

  void logAudit({
    tenantId,
    workspaceId,
    actorId: createdByUserId,
    action: "lead.saved",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      contactName: person.name,
      company: resolvedCompany.name,
      emailStatus: emailResult.status,
      emailConfidence,
      source: leadSource,
      reusedContact: Boolean(existingContact),
    },
  });

  return {
    kind: "saved",
    item: { leadId: lead.id, name: person.name, emailStatus: emailResult.status },
  };
}
