import type { DataMode, ScoutCompanyResult, ScoutPersonResult } from "./types";
import { apolloSearchCompanies, apolloSearchPeople } from "./apollo";
import { tavilySearchCompanies, tavilySearchPeople } from "./tavily";
import { googlePlacesSearchCompanies } from "./google-places";
import { db } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { accounts, contacts } from "@/db/schema";

const BUYING_TITLES = [
  "HR Director", "HR Manager", "HR Head", "Chief People Officer", "CPO",
  "Admin Head", "Admin Director", "Administration Manager",
  "Procurement Manager", "Procurement Head",
  "VP HR", "VP Human Resources", "Employee Experience",
];

export async function discoverCompanies(params: {
  tenantId: string;
  workspaceId: string;
  cities: string[];
  industries: string[];
  dataMode: DataMode;
  limit?: number;
}): Promise<ScoutCompanyResult[]> {
  const usePaid =
    params.dataMode === "paid" ||
    (params.dataMode === "auto" && !!process.env.APOLLO_API_KEY);

  const limit = params.limit ?? 25;

  // ── Step 1: Internal DB ───────────────────────────────────────────────────
  const dbResults = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.tenantId, params.tenantId),
        params.cities.length > 0 ? inArray(accounts.city, params.cities) : undefined,
      ),
    )
    .limit(limit);

  if (dbResults.length >= limit) {
    return dbResults.map(dbToResult);
  }

  const remaining = limit - dbResults.length;
  const external: ScoutCompanyResult[] = [];

  // ── Step 2: Apollo (paid/auto) ────────────────────────────────────────────
  if (usePaid) {
    try {
      const apolloResults = await apolloSearchCompanies({
        cities: params.cities,
        industries: params.industries,
        limit: remaining,
      });
      external.push(...apolloResults);
    } catch (e) {
      console.error("[waterfall] Apollo companies failed", e);
    }
  }

  // ── Step 3: Google Places (free, great for Indian local businesses) ────────
  if (external.length < remaining && process.env.GOOGLE_PLACES_API_KEY) {
    try {
      const placesLimit = remaining - external.length;
      const placesResults = await googlePlacesSearchCompanies({
        cities: params.cities,
        industries: params.industries,
        limit: placesLimit,
      });
      // Dedupe by domain/name
      const seen = new Set(external.map((c) => c.name.toLowerCase()));
      for (const r of placesResults) {
        if (!seen.has(r.name.toLowerCase())) {
          external.push(r);
          seen.add(r.name.toLowerCase());
        }
      }
    } catch (e) {
      console.error("[waterfall] Google Places companies failed", e);
    }
  }

  // ── Step 4: Tavily + LLM (free, broad web coverage) ──────────────────────
  if (external.length < remaining) {
    try {
      const tavilyLimit = remaining - external.length;
      const tavilyResults = await tavilySearchCompanies({
        cities: params.cities,
        industries: params.industries,
        limit: tavilyLimit,
      });
      const seen = new Set(external.map((c) => c.name.toLowerCase()));
      for (const r of tavilyResults) {
        if (!seen.has(r.name.toLowerCase())) {
          external.push(r);
          seen.add(r.name.toLowerCase());
        }
      }
    } catch (e) {
      console.error("[waterfall] Tavily companies failed", e);
    }
  }

  return [...dbResults.map(dbToResult), ...external];
}

export async function discoverPeople(params: {
  tenantId: string;
  workspaceId: string;
  companyName: string;
  companyDomain?: string;
  dataMode: DataMode;
  limit?: number;
}): Promise<ScoutPersonResult[]> {
  const usePaid =
    params.dataMode === "paid" ||
    (params.dataMode === "auto" && !!process.env.APOLLO_API_KEY);

  const limit = params.limit ?? 15;

  // ── Step 1: Internal DB ───────────────────────────────────────────────────
  const dbContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.tenantId, params.tenantId))
    .limit(limit);

  if (dbContacts.length >= limit) {
    return dbContacts.map(contactToResult);
  }

  const remaining = limit - dbContacts.length;
  const external: ScoutPersonResult[] = [];

  // ── Step 2: Apollo (paid/auto) ────────────────────────────────────────────
  if (usePaid && params.companyDomain) {
    try {
      const apolloResults = await apolloSearchPeople({
        companyDomain: params.companyDomain,
        titles: BUYING_TITLES,
        limit: remaining,
      });
      external.push(...apolloResults);
    } catch (e) {
      console.error("[waterfall] Apollo people failed", e);
    }
  }

  // ── Step 3: Tavily + LLM (free fallback for people) ──────────────────────
  // Note: Google Places API does not return individual employee contacts
  if (external.length < remaining) {
    try {
      const tavilyResults = await tavilySearchPeople({
        companyName: params.companyName,
        companyDomain: params.companyDomain,
        titles: BUYING_TITLES,
        limit: remaining - external.length,
      });
      const seen = new Set(external.map((p) => p.name.toLowerCase()));
      for (const r of tavilyResults) {
        if (!seen.has(r.name.toLowerCase())) {
          external.push(r);
          seen.add(r.name.toLowerCase());
        }
      }
    } catch (e) {
      console.error("[waterfall] Tavily people failed", e);
    }
  }

  return [...dbContacts.map(contactToResult), ...external];
}

function dbToResult(a: typeof accounts.$inferSelect): ScoutCompanyResult {
  return {
    name: a.name,
    domain: a.domain ?? undefined,
    website: a.website ?? undefined,
    industry: a.industry ?? undefined,
    city: a.city ?? undefined,
    employees: a.employees ?? undefined,
    logo: a.logo ?? undefined,
    giftScore: a.giftScore ?? undefined,
    intelNotes: a.intelNotes ?? undefined,
    dataSource: "internal",
    externalId: a.id,
  };
}

function contactToResult(c: typeof contacts.$inferSelect): ScoutPersonResult {
  return {
    name: c.name,
    firstName: c.firstName ?? undefined,
    lastName: c.lastName ?? undefined,
    title: c.title ?? undefined,
    department: c.department ?? undefined,
    seniority: c.seniority ?? undefined,
    email: c.email ?? undefined,
    emailStatus: c.emailStatus ?? "missing",
    phone: c.phone ?? undefined,
    linkedIn: c.linkedIn ?? undefined,
    bio: c.bio ?? undefined,
    isKeyDM: c.isKeyDM ?? false,
    matchScore: c.matchScore ?? undefined,
    dataSource: "internal",
    externalId: c.id,
  };
}
