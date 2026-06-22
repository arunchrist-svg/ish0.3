import { db, accounts, contacts, leads, leadResearch } from "@/db";
import { eq, desc } from "drizzle-orm";
import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { tavilySearch } from "./tavily-client";
import type {
  CompanyOverview,
  CompanyOverviewInput,
  CompanyOverviewResult,
  PastGiftingBrand,
} from "@/lib/company-overview";
import { OVERVIEW_CACHE_DAYS } from "@/lib/company-overview";

function isFresh(enrichedAt: Date | null | undefined, force?: boolean): boolean {
  if (force || !enrichedAt) return false;
  const ageMs = Date.now() - enrichedAt.getTime();
  return ageMs < OVERVIEW_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

function normalizePastGifting(raw: unknown): PastGiftingBrand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const g = item as Record<string, unknown>;
      return {
        year: g.year != null ? String(g.year) : undefined,
        occasion: g.occasion != null ? String(g.occasion) : undefined,
        items: g.items != null ? String(g.items) : undefined,
        perPerson: g.perPerson != null ? String(g.perPerson) : undefined,
      };
    })
    .filter((g) => g.occasion || g.items);
}

function pickDecisionMaker(
  keyContacts: { name: string; title: string | null }[],
  decisionChain: string[] | undefined,
  hint?: string,
): string | undefined {
  if (hint?.trim()) return hint.trim();
  const key = keyContacts.find((c) => c.name);
  if (key) {
    return key.title ? `${key.name} — ${key.title}` : key.name;
  }
  if (decisionChain?.length) return decisionChain[0];
  return undefined;
}

function mergeOverview(
  base: CompanyOverview,
  llm: CompanyOverview,
  known: {
    sector?: string;
    employees?: string;
    giftBudget?: string;
    giftScore?: number;
    intelligenceNotes?: string;
    pastGiftingBrands?: PastGiftingBrand[];
    decisionMaker?: string;
  },
): CompanyOverview {
  return {
    sector: known.sector || base.sector || llm.sector,
    decisionMaker: known.decisionMaker || base.decisionMaker || llm.decisionMaker,
    employees: known.employees || base.employees || llm.employees,
    nextGiftingCalendarCycle:
      base.nextGiftingCalendarCycle || llm.nextGiftingCalendarCycle,
    corporateMilestones:
      (base.corporateMilestones?.length ? base.corporateMilestones : undefined) ||
      (llm.corporateMilestones?.length ? llm.corporateMilestones : undefined),
    complianceRequirements:
      base.complianceRequirements || llm.complianceRequirements,
    pastGiftingBrands:
      (known.pastGiftingBrands?.length ? known.pastGiftingBrands : undefined) ||
      (base.pastGiftingBrands?.length ? base.pastGiftingBrands : undefined) ||
      (llm.pastGiftingBrands?.length ? llm.pastGiftingBrands : undefined),
    giftBudget: known.giftBudget || base.giftBudget || llm.giftBudget,
    giftScore: known.giftScore ?? base.giftScore ?? llm.giftScore,
    intelligenceNotes:
      known.intelligenceNotes || base.intelligenceNotes || llm.intelligenceNotes,
    confidence: llm.confidence ?? base.confidence ?? "medium",
    source: llm.source ?? base.source ?? "tavily+llm",
  };
}

function parseLlmOverview(raw: Record<string, unknown>): CompanyOverview {
  const milestones = raw.corporateMilestones ?? raw.corporate_milestones;
  const pastGifting = raw.pastGiftingBrands ?? raw.past_gifting_brands;

  return {
    sector: raw.sector != null ? String(raw.sector) : undefined,
    decisionMaker:
      raw.decisionMaker != null
        ? String(raw.decisionMaker)
        : raw.decision_maker != null
          ? String(raw.decision_maker)
          : undefined,
    employees: raw.employees != null ? String(raw.employees) : undefined,
    nextGiftingCalendarCycle:
      raw.nextGiftingCalendarCycle != null
        ? String(raw.nextGiftingCalendarCycle)
        : raw.next_gifting_calendar_cycle != null
          ? String(raw.next_gifting_calendar_cycle)
          : undefined,
    corporateMilestones: Array.isArray(milestones)
      ? milestones.map((m) => String(m)).filter(Boolean)
      : undefined,
    complianceRequirements:
      raw.complianceRequirements != null
        ? String(raw.complianceRequirements)
        : raw.compliance_requirements != null
          ? String(raw.compliance_requirements)
          : undefined,
    pastGiftingBrands: normalizePastGifting(pastGifting),
    giftBudget: raw.giftBudget != null ? String(raw.giftBudget) : undefined,
    intelligenceNotes:
      raw.intelligenceNotes != null
        ? String(raw.intelligenceNotes)
        : raw.intelligence_notes != null
          ? String(raw.intelligence_notes)
          : undefined,
    confidence:
      raw.confidence === "high" || raw.confidence === "low"
        ? raw.confidence
        : "medium",
    source: "tavily+llm",
  };
}

async function loadAccountContext(accountId: string) {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });
  if (!account) return null;

  const accountContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.accountId, accountId));

  const keyContacts = accountContacts
    .filter((c) => c.isKeyDM)
    .map((c) => ({ name: c.name, title: c.title }));

  const leadRows = await db
    .select({ leadId: leads.id })
    .from(leads)
    .where(eq(leads.accountId, accountId))
    .limit(1);

  let decisionChain: string[] | undefined;
  if (leadRows[0]) {
    const research = await db.query.leadResearch.findFirst({
      where: eq(leadResearch.leadId, leadRows[0].leadId),
      orderBy: [desc(leadResearch.createdAt)],
    });
    decisionChain = (research?.decisionChain as string[] | undefined) ?? undefined;
  }

  return {
    account,
    keyContacts,
    decisionChain,
    storedOverview: (account.companyOverview as CompanyOverview | null) ?? undefined,
  };
}

export async function enrichCompanyOverview(
  input: CompanyOverviewInput,
): Promise<CompanyOverviewResult> {
  const {
    name,
    city,
    industry,
    domain,
    website,
    employees,
    giftBudget,
    giftScore,
    intelligenceNotes,
    accountId,
    force,
    decisionMakerHint,
  } = input;

  let storedOverview: CompanyOverview | undefined;
  let dbEmployees = employees;
  let dbSector = industry;
  let dbGiftBudget = giftBudget;
  let dbGiftScore = giftScore;
  let dbIntel = intelligenceNotes;
  let dbPastGifting: PastGiftingBrand[] | undefined;
  let keyContacts: { name: string; title: string | null }[] = [];
  let decisionChain: string[] | undefined;
  let overviewEnrichedAt: Date | null | undefined;

  if (accountId) {
    const ctx = await loadAccountContext(accountId);
    if (ctx) {
      const { account } = ctx;
      storedOverview = ctx.storedOverview;
      overviewEnrichedAt = account.overviewEnrichedAt;
      dbEmployees = account.employees ?? dbEmployees;
      dbSector = account.industry ?? dbSector;
      dbGiftBudget = account.giftBudget ?? dbGiftBudget;
      dbGiftScore = account.giftScore ?? dbGiftScore;
      dbIntel = account.intelNotes ?? dbIntel;
      dbPastGifting = normalizePastGifting(account.pastGifting);
      keyContacts = ctx.keyContacts;
      decisionChain = ctx.decisionChain;

      if (storedOverview && isFresh(overviewEnrichedAt, force)) {
        const merged = mergeOverview(storedOverview, {}, {
          sector: dbSector,
          employees: dbEmployees,
          giftBudget: dbGiftBudget,
          giftScore: dbGiftScore,
          intelligenceNotes: dbIntel,
          pastGiftingBrands: dbPastGifting,
          decisionMaker: pickDecisionMaker(keyContacts, decisionChain, decisionMakerHint),
        });
        return {
          overview: merged,
          cached: true,
          enrichedAt: overviewEnrichedAt?.toISOString(),
        };
      }
    }
  }

  const knownDecisionMaker = pickDecisionMaker(
    keyContacts,
    decisionChain,
    decisionMakerHint,
  );

  const searchQuery = `"${name}" ${city ?? "India"} corporate gifting HR procurement employees vendor compliance`;
  let webContext = "";
  try {
    const hits = await tavilySearch(searchQuery, 6);
    webContext = hits
      .map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content.slice(0, 600)}`)
      .join("\n\n");
  } catch (e) {
    console.warn("[company-overview] Tavily search failed:", e);
    webContext = "No web results available.";
  }

  const prompt = `Company: ${name}
City: ${city ?? "India"}
Industry/Sector: ${industry ?? "unknown"}
Domain: ${domain ?? "unknown"}
Website: ${website ?? "unknown"}
Known employees: ${dbEmployees ?? "unknown"}
Known gift budget: ${dbGiftBudget ?? "unknown"}
Known intel: ${dbIntel ?? "none"}
Known decision maker: ${knownDecisionMaker ?? "unknown"}

Web research:
${webContext}

You are a B2B corporate gifting analyst for India Sweet House (India).
Output ONLY valid JSON with this shape:
{
  "sector": "industry sector string",
  "decisionMaker": "Name — Title or role likely to own gifting/procurement",
  "employees": "employee count or range as string",
  "nextGiftingCalendarCycle": "next likely gifting occasion and timing (e.g. Diwali Oct 2026)",
  "corporateMilestones": ["recent milestone 1", "milestone 2"],
  "complianceRequirements": "vendor onboarding, PO, GST, or compliance notes for gifting vendors",
  "pastGiftingBrands": [{ "year": "2024", "occasion": "Diwali", "items": "brand or item types", "perPerson": "₹range" }],
  "giftBudget": "estimated annual gifting budget range",
  "intelligenceNotes": "1-2 sentence gifting intelligence hook",
  "confidence": "high" | "medium" | "low"
}
Use "unknown" sparingly; infer reasonable India corporate gifting context when web data is thin. Do NOT invent specific people names unless supported by context.`;

  let llmOverview: CompanyOverview = {};
  try {
    const raw = await callLLM({
      tier: "quality",
      system: "You output only valid JSON. No markdown.",
      prompt,
      maxTokens: 768,
    });
    llmOverview = parseLlmOverview(parseJsonObjectFromLLM(raw.replace(/```json|```/g, "").trim()));
  } catch (e) {
    console.error("[company-overview] LLM failed:", e);
    llmOverview = {
      sector: dbSector,
      employees: dbEmployees,
      decisionMaker: knownDecisionMaker,
      intelligenceNotes: dbIntel,
      giftBudget: dbGiftBudget,
      pastGiftingBrands: dbPastGifting,
      confidence: "low",
      source: "fallback",
    };
  }

  const overview = mergeOverview(storedOverview ?? {}, llmOverview, {
    sector: dbSector,
    employees: dbEmployees,
    giftBudget: dbGiftBudget,
    giftScore: dbGiftScore,
    intelligenceNotes: dbIntel,
    pastGiftingBrands: dbPastGifting,
    decisionMaker: knownDecisionMaker,
  });

  const enrichedAt = new Date();

  if (accountId) {
    await db
      .update(accounts)
      .set({
        companyOverview: overview,
        overviewEnrichedAt: enrichedAt,
        employees: overview.employees ?? dbEmployees,
        industry: overview.sector ?? dbSector,
        giftBudget: overview.giftBudget ?? dbGiftBudget,
        intelNotes: overview.intelligenceNotes ?? dbIntel,
        pastGifting: overview.pastGiftingBrands?.length
          ? overview.pastGiftingBrands
          : undefined,
        updatedAt: enrichedAt,
      })
      .where(eq(accounts.id, accountId));
  }

  return {
    overview,
    cached: false,
    enrichedAt: enrichedAt.toISOString(),
  };
}
