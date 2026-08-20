import { db, contacts, leads } from "@/db";
import { and, eq, ilike } from "drizzle-orm";
import { parseTeamLinkedIn } from "@/lib/linkedin/profile-url";
import { linkedInSlug } from "@/lib/utils";
import { createManualLead, type CreateLeadInput } from "@/lib/leads/crud";
import { parsePeopleFromSearchResults } from "@/lib/enrichment/people-parser";
import { currentEmployerFromHeadline } from "@/lib/enrichment/person-company-match";
import { tavilySearch } from "@/lib/enrichment/tavily-client";
import { hasTavilyKey } from "@/lib/enrichment/discovery-prerequisites";
import { enrichContactAccurate } from "@/lib/enrichment/enrich-accurate";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { sanitizeEmail, sanitizePhone } from "@/lib/enrichment/validate-contact";
import { sanitizeJobTitle } from "@/lib/enrichment/job-title";
import { enqueueResearchForLeads } from "@/lib/jobs/enqueue";
import { enrichModeForSettings } from "@/lib/enrichment/provider-config";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";

export type LinkedInProfileData = {
  name: string;
  title?: string;
  company: string;
  city?: string;
  email?: string;
  phone?: string;
  linkedIn: string;
  bio?: string;
};

export class LinkedInProfileIncompleteError extends Error {
  partial: Omit<LinkedInProfileData, "company"> & { company?: string };

  constructor(message: string, partial: LinkedInProfileIncompleteError["partial"]) {
    super(message);
    this.name = "LinkedInProfileIncompleteError";
    this.partial = partial;
  }
}

function nameFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug).replace(/-/g, " ").trim();
  const name = decoded.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 60) return null;
  if (/^\d+$/.test(name)) return null;
  return name;
}

function companyFromHits(hits: { title: string; content: string }[]): string | undefined {
  for (const hit of hits) {
    const fromTitle = currentEmployerFromHeadline(hit.title);
    if (fromTitle) return fromTitle;
    const fromContent = currentEmployerFromHeadline(hit.content);
    if (fromContent) return fromContent;
  }
  return undefined;
}

function pickMatchingHits(
  hits: { title: string; url: string; content: string }[],
  slug: string,
): { title: string; url: string; content: string }[] {
  const slugLower = slug.toLowerCase();
  const exact = hits.filter((hit) => linkedInSlug(hit.url)?.toLowerCase() === slugLower);
  if (exact.length) return exact;
  return hits.filter(
    (hit) =>
      linkedInSlug(hit.url)?.toLowerCase() === slugLower ||
      hit.url.toLowerCase().includes(`/in/${slugLower}`) ||
      hit.content.toLowerCase().includes(`/in/${slugLower}`),
  );
}

export async function resolveLinkedInProfile(linkedInUrl: string): Promise<LinkedInProfileData> {
  const linkedIn = parseTeamLinkedIn(linkedInUrl);
  if (!linkedIn) throw new Error("Enter a LinkedIn profile URL (linkedin.com/in/...)");

  const slug = linkedInSlug(linkedIn);
  if (!slug) throw new Error("Could not read this LinkedIn profile URL");

  let name = nameFromSlug(slug) ?? undefined;
  let title: string | undefined;
  let city: string | undefined;
  let bio: string | undefined;
  let company: string | undefined;
  let email: string | undefined;
  let phone: string | undefined;

  const hits: { title: string; url: string; content: string }[] = [];
  if (hasTavilyKey()) {
    const queries = [
      `site:linkedin.com/in/${slug}`,
      `"${linkedIn}"`,
      `linkedin.com/in/${slug}`,
    ];
    for (const query of queries) {
      const results = await tavilySearch(query, 5).catch(() => []);
      if (results.length) {
        hits.push(...results);
        break;
      }
    }
  }

  const matchingHits = pickMatchingHits(hits, slug);
  if (matchingHits.length) {
    const parsed = parsePeopleFromSearchResults(matchingHits, 1, "linkedin_import");
    const person = parsed[0];
    if (person) {
      name = person.name || name;
      title = sanitizeJobTitle(person.title);
      city = person.location;
      bio = person.bio;
    }
    company = companyFromHits(matchingHits);
    if (!company && title) {
      company = currentEmployerFromHeadline(title) ?? undefined;
    }
  }

  const enrichInput = {
    name: name ?? slug.replace(/-/g, " "),
    title,
    company: company ?? "Unknown Company",
    linkedinUrl: linkedIn,
    city,
  };

  const enriched = await enrichContactAccurate(enrichInput, { allowPaid: true });
  if (enriched.contact) {
    name = enriched.contact.name?.trim() || name;
    title = sanitizeJobTitle(enriched.contact.title) || title;
    email = sanitizeEmail(enriched.contact.email);
    phone = sanitizePhone(enriched.contact.phone);
    if (enriched.contact.company?.trim() && enriched.contact.company !== "Unknown Company") {
      company = enriched.contact.company.trim();
    }
    if (enriched.contact.city?.trim()) {
      city = enriched.contact.city.trim();
    }
  }

  if (!name) {
    throw new Error("Could not determine a name for this LinkedIn profile");
  }

  if (!company || company === "Unknown Company") {
    throw new LinkedInProfileIncompleteError(
      "Could not determine company from this LinkedIn profile. Add company manually or try again later.",
      { name, title, city, email, phone, linkedIn, bio },
    );
  }

  return {
    name,
    title,
    company,
    city,
    email,
    phone,
    linkedIn,
    bio,
  };
}

export async function findExistingLeadIdByLinkedIn(params: {
  tenantId: string;
  linkedIn: string;
}): Promise<string | null> {
  const slug = linkedInSlug(params.linkedIn);
  if (!slug) return null;

  const pattern = `%/in/${slug}%`;
  const rows = await db
    .select({ leadId: leads.id, linkedIn: contacts.linkedIn })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.tenantId, params.tenantId), ilike(contacts.linkedIn, pattern)))
    .limit(5);

  const match = rows.find((row) => linkedInSlug(row.linkedIn) === slug);
  return match?.leadId ?? null;
}

export type CreateLeadFromLinkedInParams = {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  linkedInUrl: string;
  enrich?: boolean;
  score?: number;
};

export type CreateLeadFromLinkedInResult = {
  id: string;
  existing: boolean;
  profile: LinkedInProfileData;
  enriched?: boolean;
};

export async function createLeadFromLinkedInUrl(
  params: CreateLeadFromLinkedInParams,
): Promise<CreateLeadFromLinkedInResult> {
  const profile = await resolveLinkedInProfile(params.linkedInUrl);

  const existingId = await findExistingLeadIdByLinkedIn({
    tenantId: params.tenantId,
    linkedIn: profile.linkedIn,
  });
  if (existingId) {
    return { id: existingId, existing: true, profile };
  }

  const leadInput: CreateLeadInput = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    name: profile.name,
    title: profile.title,
    email: profile.email,
    phone: profile.phone,
    linkedIn: profile.linkedIn,
    company: profile.company,
    city: profile.city,
    score: params.score ?? 65,
    leadSource: "linkedin",
    dataSource: "linkedin",
    tags: ["Lead", "LinkedIn"],
    trustProvidedEmail: Boolean(profile.email),
  };

  const created = await createManualLead(leadInput);
  if (created.existing) {
    return { id: created.id, existing: true, profile };
  }

  let enriched = false;
  const shouldEnrich = params.enrich !== false;
  if (shouldEnrich) {
    const cfg = await getResolvedWorkspaceEnrichmentConfig();
    const canEnrich = cfg.enrichProvider !== "none";
    const needsMore = !profile.email || !profile.phone || !profile.title;

    if (canEnrich && needsMore) {
      try {
        const mode = enrichModeForSettings(cfg.enrichProvider, cfg.dataMode);
        await enrichLeadById({
          leadId: created.id,
          mode,
          dataMode: cfg.dataMode,
        });
        enriched = true;
      } catch (error) {
        console.error("[from-linkedin] enrich failed:", error);
      }
    }
  }

  void enqueueResearchForLeads([created.id]);

  return { id: created.id, existing: false, profile, enriched };
}
