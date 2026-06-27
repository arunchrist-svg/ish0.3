import { db, contacts, accounts, leads, enrichmentRuns } from "@/db";
import { eq } from "drizzle-orm";
import { enrichContactAccurate, applyVerificationGate } from "./enrich-accurate";
import { verifyEmail } from "./verify";
import { isGenericCompanyEmail, sanitizeEmail, sanitizePhone } from "./validate-contact";
import {
  shouldAutoAcceptEmail,
  confidenceTier,
  isNamedPerson,
  type ConfidenceTier,
} from "./confidence";
import { providerToSource, type EnrichmentInput, type EnrichmentSource } from "./enrich-types";
import { domainFromWebsite } from "./provider-utils";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { resolveEnrichmentConfig } from "./config";
import { loadWorkspaceEnrichmentOverrides } from "@/lib/settings/workspace-settings";
import { providerChainForEnrichSetting } from "./provider-config";
import type { EnrichProvider } from "./config";
import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { hasLLMKey, hasTavilyKey } from "./discovery-prerequisites";
import { tavilySearch } from "./tavily-client";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "./types";
import type { EnrichmentProviderId } from "./enrich-types";
import {
  type ContactEmailEntry,
  mergeAlternateEmails,
} from "./contact-emails";
import type { ScoredCandidate } from "./enrich-accurate";

export type EnrichMode = "free" | "paid";

export type EnrichContactResult = {
  email?: string;
  phone?: string;
  linkedIn?: string;
  title?: string;
  emailStatus: "verified" | "unverified" | "generic" | "missing";
  emailConfidence: number;
  confidenceTier: ConfidenceTier;
  enrichmentSource?: EnrichmentSource;
  enrichmentProvider?: EnrichmentProviderId;
  providerId?: EnrichmentProviderId;
  message?: string;
  attempts?: unknown;
  alternateEmails?: ContactEmailEntry[];
  discoveredEmails?: ContactEmailEntry[];
};

function websiteUrlFromCompany(company: { domain?: string; website?: string }): string | undefined {
  if (company.website) {
    return company.website.startsWith("http") ? company.website : `https://${company.website}`;
  }
  if (company.domain) return `https://${company.domain}`;
  return undefined;
}

function toEnrichmentInput(
  person: { name: string; title?: string; email?: string; phone?: string; linkedIn?: string },
  company: { name: string; city?: string; domain?: string; website?: string },
): EnrichmentInput {
  return {
    name: person.name,
    title: person.title,
    company: company.name,
    city: company.city,
    email: person.email,
    linkedinUrl: normalizeLinkedInUrl(person.linkedIn),
    websiteUrl: websiteUrlFromCompany(company),
  };
}

async function emailStatusFromVerify(email?: string): Promise<EnrichContactResult["emailStatus"]> {
  if (!email) return "missing";
  const result = await verifyEmail(email);
  return result.status;
}


async function emailsFromCandidates(candidates: ScoredCandidate[]): Promise<ContactEmailEntry[]> {
  const entries: ContactEmailEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const email = sanitizeEmail(candidate.contact.email);
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    entries.push({
      email,
      emailStatus: await emailStatusFromVerify(email),
      emailConfidence: candidate.score,
      enrichmentSource: providerToSource(candidate.providerId),
      enrichmentProvider: candidate.providerId,
    });
  }
  return entries.sort((a, b) => (b.emailConfidence ?? 0) - (a.emailConfidence ?? 0));
}

async function fillMissingTitle(input: EnrichmentInput): Promise<string | undefined> {
  if (input.title?.trim()) return input.title.trim();
  if (!hasTavilyKey() || !hasLLMKey()) return undefined;

  const query = `"${input.name}" "${input.company}" job title role India LinkedIn`;
  const results = await tavilySearch(query, 5).catch(() => []);
  if (!results.length) return undefined;

  const context = results
    .slice(0, 6)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 350)}`)
    .join("\n\n");

  try {
    const raw = await callLLM({
      tier: "fast",
      system: `Extract this person's job title at the company from search results.
Output ONLY valid JSON: { "title": string | null }
Return null if title is not clearly stated. Never invent titles.`,
      prompt: `Person: ${input.name}\nCompany: ${input.company}\n\n${context}`,
      maxTokens: 128,
    });
    const parsed = parseJsonObjectFromLLM(raw);
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    return title.length >= 3 ? title : undefined;
  } catch {
    return undefined;
  }
}

function acceptOptions(person: { name: string }): { namedPerson: boolean } {
  return { namedPerson: isNamedPerson(person.name) };
}

export async function enrichPersonContact(params: {
  person: ScoutPersonResult;
  company: ScoutCompanyResult;
  mode: EnrichMode;
  dataMode?: DataMode;
  enrichProvider?: EnrichProvider;
  refetch?: boolean;
}): Promise<EnrichContactResult> {
  const input = toEnrichmentInput(params.person, params.company);
  const named = acceptOptions(params.person);
  let resolvedTitle = params.person.title?.trim() || undefined;

  if (!resolvedTitle) {
    resolvedTitle = await fillMissingTitle(input);
  }

  const existingEmail = sanitizeEmail(params.person.email);
  const existingPhone = sanitizePhone(params.person.phone);

  if (existingEmail && params.mode === "free" && !isGenericCompanyEmail(existingEmail) && !params.refetch) {
    const confidence = 60;
    return {
      email: existingEmail,
      phone: existingPhone,
      linkedIn: normalizeLinkedInUrl(params.person.linkedIn),
      title: resolvedTitle,
      emailStatus: await emailStatusFromVerify(existingEmail),
      emailConfidence: confidence,
      confidenceTier: confidenceTier(confidence, existingEmail),
      enrichmentSource: params.person.dataSource as EnrichmentSource | undefined,
    };
  }

  const dataMode = params.dataMode ?? ((process.env.DEFAULT_DATA_MODE ?? "free") as DataMode);
  const enrichProvider = params.enrichProvider ?? "website_email";
  const preferredChain = providerChainForEnrichSetting(enrichProvider, dataMode);

  const result = await enrichContactAccurate(input, {
    allowPaid: params.mode === "paid",
    paidOnly: params.mode === "paid",
    freeOnly: params.mode === "free",
    stopOnPersonalEmail: params.mode === "free",
    preferredChain: preferredChain.length ? preferredChain : undefined,
  });

  if (!result.contact) {
    const email = existingEmail && !isGenericCompanyEmail(existingEmail) ? existingEmail : undefined;
    return {
      email,
      phone: existingPhone,
      linkedIn: normalizeLinkedInUrl(params.person.linkedIn),
      title: resolvedTitle,
      emailStatus: email ? await emailStatusFromVerify(email) : "missing",
      emailConfidence: 0,
      confidenceTier: email ? confidenceTier(0, email) : "missing",
      message: result.message,
      attempts: result.attempts,
    };
  }

  const discoveredEmails = await emailsFromCandidates(result.candidates ?? []);
  const gated = applyVerificationGate(input, result.contact);
  let email = sanitizeEmail(gated.email);
  const phone = sanitizePhone(gated.phone) ?? existingPhone;
  const linkedIn = normalizeLinkedInUrl(gated.linkedinUrl) ?? normalizeLinkedInUrl(params.person.linkedIn);
  const title = gated.title?.trim() || resolvedTitle || result.contact.title?.trim();
  const score = result.confidence ?? 0;

  if (email && isGenericCompanyEmail(email) && named.namedPerson && params.mode === "free") {
    email = existingEmail && !isGenericCompanyEmail(existingEmail) ? existingEmail : undefined;
  }

  const tier = email ? confidenceTier(score, email) : "missing";

  return {
    email,
    phone,
    linkedIn,
    title,
    emailStatus: email ? await emailStatusFromVerify(email) : "missing",
    emailConfidence: email ? score : 0,
    confidenceTier: tier,
    enrichmentSource: result.providerId ? providerToSource(result.providerId) : undefined,
    enrichmentProvider: result.providerId,
    providerId: result.providerId,
    message: result.message,
    attempts: result.attempts,
    discoveredEmails,
  };
}

export async function enrichLeadById(params: {
  leadId: string;
  mode: EnrichMode;
  dataMode?: DataMode;
  refetch?: boolean;
}): Promise<EnrichContactResult & { leadId: string; contactId: string; success: boolean }> {
  const rows = await db
    .select({ lead: leads, contact: contacts, account: accounts })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(eq(leads.id, params.leadId))
    .limit(1);

  if (!rows.length) throw new Error("Lead not found");

  const { lead, contact, account } = rows[0];
  const person: ScoutPersonResult = {
    name: contact.name,
    firstName: contact.firstName ?? undefined,
    lastName: contact.lastName ?? undefined,
    title: contact.title ?? undefined,
    email: contact.email ?? undefined,
    emailStatus: contact.emailStatus ?? "missing",
    phone: contact.phone ?? undefined,
    linkedIn: contact.linkedIn ?? undefined,
    dataSource: contact.dataSource ?? "internal",
  };
  const company: ScoutCompanyResult = {
    name: account.name,
    domain: account.domain ?? domainFromWebsite(account.website ?? undefined),
    website: account.website ?? undefined,
    city: account.city ?? undefined,
    employees: account.employees ?? undefined,
    dataSource: account.dataSource ?? "internal",
  };

  const enriched = await enrichPersonContact({
    person,
    company,
    mode: params.mode,
    dataMode: params.dataMode,
    refetch: params.refetch,
  });

  const named = acceptOptions(person);
  const currentEmail = sanitizeEmail(contact.email);
  const currentIsGeneric = currentEmail ? isGenericCompanyEmail(currentEmail) : false;

  const shouldWriteEmail = enriched.email && (
    params.mode === "paid" ||
    shouldAutoAcceptEmail(enriched.emailConfidence, enriched.email, named) ||
    (currentIsGeneric && !isGenericCompanyEmail(enriched.email))
  );

  let nextEmail = shouldWriteEmail ? enriched.email : contact.email ?? undefined;
  if (nextEmail && isGenericCompanyEmail(nextEmail) && named.namedPerson && params.mode === "free") {
    nextEmail = currentIsGeneric ? undefined : currentEmail;
  }

  const nextPhone = enriched.phone ?? contact.phone ?? undefined;
  const nextTitle = enriched.title?.trim() || contact.title || undefined;
  const nextStatus = nextEmail ? enriched.emailStatus : (contact.emailStatus ?? "missing");

  const alternateEmails = mergeAlternateEmails(
    nextEmail,
    (contact.alternateEmails as ContactEmailEntry[] | null) ?? [],
    enriched.discoveredEmails ?? [],
  );

  await db
    .update(contacts)
    .set({
      email: nextEmail ?? null,
      phone: nextPhone ?? null,
      title: nextTitle ?? null,
      linkedIn: enriched.linkedIn ?? contact.linkedIn,
      emailStatus: nextEmail ? nextStatus : "missing",
      emailConfidence: enriched.emailConfidence || contact.emailConfidence,
      enrichmentSource: enriched.enrichmentSource ?? contact.enrichmentSource,
      enrichmentProvider: enriched.enrichmentProvider ?? contact.enrichmentProvider,
      alternateEmails,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contact.id));

  await db.insert(enrichmentRuns).values({
    contactId: contact.id,
    leadId: lead.id,
    provider: enriched.providerId ?? params.mode,
    dataMode: (params.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode,
    success: Boolean(nextEmail || nextPhone || nextTitle),
    emailFound: Boolean(nextEmail),
    emailVerified: enriched.emailStatus === "verified",
    result: {
      confidence: enriched.emailConfidence,
      tier: enriched.confidenceTier,
      title: nextTitle,
      attempts: enriched.attempts,
      mode: params.mode,
    },
  });

  return {
    leadId: lead.id,
    contactId: contact.id,
    success: Boolean(nextEmail || nextPhone || nextTitle),
    ...enriched,
    email: nextEmail,
    phone: nextPhone ?? undefined,
    title: nextTitle,
    emailStatus: nextEmail ? nextStatus : "missing",
    alternateEmails,
  };
}

export async function shouldEnrichOnImport(): Promise<boolean> {
  const overrides = await loadWorkspaceEnrichmentOverrides();
  return resolveEnrichmentConfig(undefined, overrides).enrichOnImport;
}

export { shouldAutoAcceptEmail, isNamedPerson };
