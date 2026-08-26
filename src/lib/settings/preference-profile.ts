import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";
import { normalizeEmailKeywords } from "@/lib/brand/email-keywords";
import {
  normalizeScoutRoleFilters,
  resolvePlatformIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import type { BrandConfig } from "@/lib/email/config";
import {
  INDIA_STATES,
  sanitizeScoutGeo,
  scoutGeoHasSelection,
  summarizeScoutGeo,
  type ScoutGeoSelection,
} from "@/lib/geo/india";
import { requireTenantContext } from "@/lib/tenant";
import { SCOUT_DEPARTMENTS, SCOUT_INDUSTRIES, SCOUT_SENIORITY } from "@/lib/scouting-data";
import { getVerticalPack, resolveVerticalPackId } from "@/vertical-packs";
import type { ScoutQualityLearning } from "@/lib/enrichment/quality-profile";
import type { PlantSeatGoldCase } from "@/lib/scout/plant-seat-gold";
import { parsePlantSeatGoldCases } from "@/lib/scout/plant-seat-gold";

export type PreferenceTopic = "scout" | "leads" | "email" | "close";

export type PreferenceClosePath = "book_call" | "send_sample" | "book_visit" | "send_quote";

export type PreferenceChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type UserPreferenceProfile = {
  version: 1;
  updatedAt: string;
  source: "onboarding_chat";
  summary: string;
  sellingMotion?: string;
  toneNotes?: string;
  closePath?: PreferenceClosePath;
  preferredCtaIds?: string[];
  defaultCtaId?: string;
  scout?: {
    geo?: ScoutGeoSelection;
    industries?: string[];
    departments?: string[];
    seniority?: string[];
  };
  messages: PreferenceChatMessage[];
  topicsCovered: PreferenceTopic[];
  scoutQualityLearning?: ScoutQualityLearning;
  /** Keep/Drop cases for plant-seat learning (workspace scoped). */
  plantSeatGoldCases?: PlantSeatGoldCase[];
};

export type PreferenceExtract = {
  summary?: string;
  sellingMotion?: string;
  toneNotes?: string;
  icpSummary?: string;
  closePath?: PreferenceClosePath;
  preferredCtaIds?: string[];
  defaultCtaId?: string;
  industries?: string[];
  departments?: string[];
  seniority?: string[];
  geo?: ScoutGeoSelection | null;
};

export type CoachBeat = {
  topic: PreferenceTopic;
  headline: string;
  coachLine: string;
  chips: string[];
  recommendedChip?: string;
};

const CLOSE_PATHS: PreferenceClosePath[] = ["book_call", "send_sample", "book_visit", "send_quote"];
const PRIMARY_CTA_IDS = ["meet_online", "gift_sampling", "meet_in_person"] as const;

const CLOSE_LABELS: Record<PreferenceClosePath, string> = {
  book_call: "Book a short video call",
  send_sample: "Send a sample or trial",
  book_visit: "Schedule an in-person visit",
  send_quote: "Share a quote or options list",
};

const CTA_LABEL: Record<string, string> = {
  meet_online: "Meet online",
  gift_sampling: "Demo or trial",
  meet_in_person: "Meet in person",
};

const REQUIRED_TOPICS: PreferenceTopic[] = ["scout", "email", "close"];

function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function matchCatalog(raw: string[], catalog: readonly string[]): string[] {
  const lowerCatalog = catalog.map((item) => ({ item, key: item.toLowerCase() }));
  const out: string[] = [];
  for (const value of raw) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const hit = lowerCatalog.find((entry) => entry.key === key || key.includes(entry.key) || entry.key.includes(key));
    if (hit && !out.includes(hit.item)) out.push(hit.item);
  }
  return out;
}

export function isPreferenceClosePath(value: unknown): value is PreferenceClosePath {
  return typeof value === "string" && (CLOSE_PATHS as string[]).includes(value);
}

export function normalizeOutreachCtaId(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return s;
  if (s === "meet_online" || (s.includes("online") && (s.includes("meet") || s.includes("call") || s.includes("demo")))) {
    return "meet_online";
  }
  if (s === "meet_in_person" || s.includes("in_person") || (s.includes("visit") && !s.includes("online"))) {
    return "meet_in_person";
  }
  if (s === "gift_sampling" || s.includes("demo") || s.includes("trial") || s.includes("sample") || s.includes("tasting")) {
    return "gift_sampling";
  }
  return s;
}

export function resolveDefaultOutreachCta(brand: Partial<BrandConfig>): string {
  const packId = resolveVerticalPackId(brand.verticalPackId, brand.brandSlug);
  const allowed = getVerticalPack(packId).outreachCtas.map((c) => c.id);
  const preferred = brand.defaultOutreachCta ? normalizeOutreachCtaId(brand.defaultOutreachCta) : "";
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0] ?? "meet_online";
}

export function emptyPreferenceProfile(): UserPreferenceProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "onboarding_chat",
    summary: "",
    messages: [],
    topicsCovered: [],
  };
}

function parseMessages(raw: unknown): PreferenceChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: PreferenceChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    out.push({
      role: row.role,
      content: row.content.trim(),
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

function parseTopics(raw: unknown): PreferenceTopic[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<PreferenceTopic>(["scout", "leads", "email", "close"]);
  return uniqueStrings(raw.filter((item): item is string => typeof item === "string")).filter(
    (item): item is PreferenceTopic => allowed.has(item as PreferenceTopic),
  );
}

export function parseUserPreferenceProfile(raw: unknown): UserPreferenceProfile {
  const base = emptyPreferenceProfile();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const scoutRaw = o.scout && typeof o.scout === "object" && !Array.isArray(o.scout) ? (o.scout as Record<string, unknown>) : null;
  const geo = scoutRaw ? sanitizeScoutGeo(scoutRaw.geo as Partial<ScoutGeoSelection> | undefined) : undefined;
  const preferredCtaIds = Array.isArray(o.preferredCtaIds)
    ? uniqueStrings(o.preferredCtaIds.filter((id): id is string => typeof id === "string").map(normalizeOutreachCtaId))
    : undefined;

  return {
    version: 1,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : base.updatedAt,
    source: "onboarding_chat",
    summary: typeof o.summary === "string" ? o.summary : "",
    sellingMotion: typeof o.sellingMotion === "string" ? o.sellingMotion : undefined,
    toneNotes: typeof o.toneNotes === "string" ? o.toneNotes : undefined,
    closePath: isPreferenceClosePath(o.closePath) ? o.closePath : undefined,
    preferredCtaIds: preferredCtaIds?.length ? preferredCtaIds : undefined,
    defaultCtaId: typeof o.defaultCtaId === "string" ? normalizeOutreachCtaId(o.defaultCtaId) : undefined,
    scout: scoutRaw
      ? {
          geo: geo && scoutGeoHasSelection(geo) ? geo : undefined,
          industries: Array.isArray(scoutRaw.industries)
            ? matchCatalog(scoutRaw.industries.filter((i): i is string => typeof i === "string"), SCOUT_INDUSTRIES)
            : undefined,
          departments: Array.isArray(scoutRaw.departments)
            ? matchCatalog(scoutRaw.departments.filter((d): d is string => typeof d === "string"), SCOUT_DEPARTMENTS)
            : undefined,
          seniority: Array.isArray(scoutRaw.seniority)
            ? matchCatalog(scoutRaw.seniority.filter((s): s is string => typeof s === "string"), SCOUT_SENIORITY)
            : undefined,
        }
      : undefined,
    messages: parseMessages(o.messages),
    topicsCovered: parseTopics(o.topicsCovered),
    scoutQualityLearning: parseLearning(o.scoutQualityLearning),
    plantSeatGoldCases: parsePlantSeatGoldCases(o.plantSeatGoldCases),
  };
}

function parseLearning(raw: unknown): ScoutQualityLearning | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.updatedAt !== "string") return undefined;
  return {
    updatedAt: o.updatedAt,
    sampleCount: typeof o.sampleCount === "number" ? o.sampleCount : 0,
    outreachedCount: typeof o.outreachedCount === "number" ? o.outreachedCount : 0,
    repliedCount: typeof o.repliedCount === "number" ? o.repliedCount : 0,
    deltasByIntent:
      o.deltasByIntent && typeof o.deltasByIntent === "object"
        ? (o.deltasByIntent as ScoutQualityLearning["deltasByIntent"])
        : {},
  };
}

export async function loadUserPreferenceProfile(workspaceId?: string): Promise<UserPreferenceProfile> {
  try {
    const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, resolvedWorkspaceId))
      .limit(1);
    return parseUserPreferenceProfile(row?.userPreferenceProfile);
  } catch (e) {
    console.error("[preference-profile] load failed:", e);
    return emptyPreferenceProfile();
  }
}

export async function saveUserPreferenceProfile(
  profile: UserPreferenceProfile,
  workspaceId?: string,
): Promise<UserPreferenceProfile> {
  const resolvedWorkspaceId = workspaceId ?? (await requireTenantContext()).workspaceId;
  const next: UserPreferenceProfile = {
    ...profile,
    version: 1,
    source: "onboarding_chat",
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(workspaceSettings)
    .values({
      workspaceId: resolvedWorkspaceId,
      userPreferenceProfile: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        userPreferenceProfile: next,
        updatedAt: new Date(),
      },
    });
  return next;
}

export function parseScoutGeoFromText(text: string): ScoutGeoSelection | null {
  const lower = text.toLowerCase();
  if (/\bentire india\b|\ball india\b|\bnationwide\b|\bacross india\b/.test(lower)) {
    return { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] };
  }
  const stateIds: string[] = [];
  const districtIds: string[] = [];
  for (const state of INDIA_STATES) {
    if (lower.includes(state.name.toLowerCase()) || new RegExp(`\\b${state.id.toLowerCase()}\\b`).test(lower)) {
      stateIds.push(state.id);
    }
    for (const district of state.districts) {
      const names = [district.displayName, district.name, ...district.aliases].filter((n) => n.replace(/\s+/g, "").length >= 5);
      if (names.some((name) => lower.includes(name.toLowerCase()))) districtIds.push(district.id);
    }
  }
  const geo = sanitizeScoutGeo({ entireIndia: false, regionIds: [], stateIds, districtIds });
  return scoutGeoHasSelection(geo) ? geo : null;
}

function extractCtasFromText(lower: string): string[] {
  const ids: string[] = [];
  if (/\bmeet online\b|\bvideo call\b|\bzoom\b|\bonline (?:meet|call|demo)\b/.test(lower) || (/\bcall\b/.test(lower) && !/\bin person\b|\bvisit\b/.test(lower))) {
    ids.push("meet_online");
  }
  if (/\bdemo\b|\btrial\b|\bsample\b|\btasting\b/.test(lower)) ids.push("gift_sampling");
  if (/\bin person\b|\bvisit\b|\bonsite\b|\bon-site\b/.test(lower)) ids.push("meet_in_person");
  return uniqueStrings(ids);
}

function extractClosePath(lower: string): PreferenceClosePath | undefined {
  if (/\bquote\b|\bpricing\b|\bproposal\b/.test(lower)) return "send_quote";
  if (/\bvisit\b|\bin person\b|\bonsite\b/.test(lower) && !/\bdemo call/.test(lower)) return "book_visit";
  if (/\bsample\b|\btasting\b|\btrial kit\b/.test(lower)) return "send_sample";
  if (/\bcall\b|\bdemo\b|\bzoom\b|\bmeet online\b/.test(lower)) return "book_call";
  return undefined;
}

export function extractPreferencesFromText(text: string): PreferenceExtract {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const lower = trimmed.toLowerCase();
  const industries = SCOUT_INDUSTRIES.filter((item) => lower.includes(item.toLowerCase()));
  if (/\btech(?:nology)?\b|\bsaas\b/.test(lower) && !industries.includes("Technology")) industries.push("Technology");

  const departments: string[] = [];
  if (/\bhr\b|\bhuman resources\b/.test(lower)) departments.push("HR");
  if (/\badmin\b/.test(lower)) departments.push("Admin");
  if (/\bprocurement\b|\bpurchasing\b/.test(lower)) departments.push("Procurement");
  if (/\bfacilities\b/.test(lower)) departments.push("Facilities");
  if (/\bmarketing\b/.test(lower)) departments.push("Marketing");
  if (/\boperations\b|\bops\b/.test(lower)) departments.push("Operations");
  if (/\bleadership\b/.test(lower)) departments.push("Leadership");

  const seniority: string[] = [];
  if (/\bc[- ]?level\b|\bcxo\b|\bchief\b/.test(lower)) seniority.push("C-Level");
  if (/\bfounders?\b/.test(lower)) seniority.push("Founders");
  if (/\bvp\b|\bvice president/.test(lower)) seniority.push("VP");
  if (/\bdirectors?\b/.test(lower)) seniority.push("Director");
  if (/\bmanagers?\b/.test(lower)) seniority.push("Manager");

  const preferredCtaIds = extractCtasFromText(lower);
  return {
    sellingMotion: /\bclose\b|\bdemo\b|\bsample\b|\bcall\b/.test(lower) ? trimmed : undefined,
    toneNotes: /\bformal\b|\bfriendly\b|\bdirect\b|\bnever\b|\balways remember\b/i.test(trimmed) ? trimmed : undefined,
    icpSummary: trimmed.length > 40 && /\bsell to\b|\bbuyers?\b|\bcompanies that\b/.test(lower) ? trimmed : undefined,
    closePath: extractClosePath(lower),
    preferredCtaIds: preferredCtaIds.length ? preferredCtaIds : undefined,
    defaultCtaId: preferredCtaIds[0],
    industries: industries.length ? industries : undefined,
    departments: departments.length ? uniqueStrings(departments) : undefined,
    seniority: seniority.length ? uniqueStrings(seniority) : undefined,
    geo: parseScoutGeoFromText(trimmed),
  };
}

export function mergePreferenceExtract(prev: PreferenceExtract, next: PreferenceExtract): PreferenceExtract {
  const preferredCtaIds = uniqueStrings([...(prev.preferredCtaIds ?? []), ...(next.preferredCtaIds ?? [])]);
  const nextGeo = next.geo && scoutGeoHasSelection(sanitizeScoutGeo(next.geo)) ? sanitizeScoutGeo(next.geo) : null;
  const prevGeo = prev.geo && scoutGeoHasSelection(sanitizeScoutGeo(prev.geo)) ? sanitizeScoutGeo(prev.geo) : null;
  return {
    summary: next.summary?.trim() || prev.summary,
    sellingMotion: next.sellingMotion?.trim() || prev.sellingMotion,
    toneNotes: next.toneNotes?.trim() || prev.toneNotes,
    icpSummary: next.icpSummary?.trim() || prev.icpSummary,
    closePath: next.closePath ?? prev.closePath,
    preferredCtaIds: preferredCtaIds.length ? preferredCtaIds : undefined,
    defaultCtaId: next.defaultCtaId || prev.defaultCtaId || preferredCtaIds[0],
    industries: uniqueStrings([...(prev.industries ?? []), ...(next.industries ?? [])]),
    departments: uniqueStrings([...(prev.departments ?? []), ...(next.departments ?? [])]),
    seniority: uniqueStrings([...(prev.seniority ?? []), ...(next.seniority ?? [])]),
    geo: nextGeo ?? prevGeo,
  };
}

export function extractFromProfile(profile: UserPreferenceProfile): PreferenceExtract {
  return {
    summary: profile.summary,
    sellingMotion: profile.sellingMotion,
    toneNotes: profile.toneNotes,
    closePath: profile.closePath,
    preferredCtaIds: profile.preferredCtaIds,
    defaultCtaId: profile.defaultCtaId,
    industries: profile.scout?.industries,
    departments: profile.scout?.departments,
    seniority: profile.scout?.seniority,
    geo: profile.scout?.geo,
  };
}

export function topicsCoveredFromExtract(extract: PreferenceExtract): PreferenceTopic[] {
  const topics: PreferenceTopic[] = [];
  const geo = extract.geo ? sanitizeScoutGeo(extract.geo) : null;
  if ((extract.industries?.length ?? 0) > 0 || (geo && scoutGeoHasSelection(geo)) || (extract.departments?.length ?? 0) > 0 || (extract.seniority?.length ?? 0) > 0) {
    topics.push("scout");
  }
  if ((extract.departments?.length ?? 0) > 0 || (extract.seniority?.length ?? 0) > 0) topics.push("leads");
  if ((extract.preferredCtaIds?.length ?? 0) > 0) topics.push("email");
  if (extract.closePath) topics.push("close");
  return topics;
}

export function isPreferenceReady(topics: readonly string[]): boolean {
  return REQUIRED_TOPICS.every((topic) => topics.includes(topic));
}

function formatGeoLabel(geo?: ScoutGeoSelection | null): string {
  if (!geo) return "";
  const normalized = sanitizeScoutGeo(geo);
  if (!scoutGeoHasSelection(normalized)) return "";
  const summary = summarizeScoutGeo(normalized);
  return summary.toLowerCase() === "entire india" ? "entire India" : summary;
}

export function buildPreferenceSummary(extract: PreferenceExtract): string {
  const who = uniqueStrings([...(extract.seniority ?? []), ...(extract.departments ?? []), ...(extract.industries ?? [])]);
  const where = formatGeoLabel(extract.geo);
  const cta = (extract.preferredCtaIds ?? []).map((id) => CTA_LABEL[id] ?? id).filter(Boolean);
  const close = extract.closePath ? CLOSE_LABELS[extract.closePath] : "";
  const scoutBit = who.length
    ? `We'll scout ${who.join(", ")}${where ? ` in ${where}` : ""}`
    : where
      ? `We'll scout accounts in ${where}`
      : "We'll scout your target accounts";
  const emailBit = cta.length ? `write toward ${cta.join(" and ")}` : "write toward a clear first ask";
  const closeBit = close ? `close with ${close}` : "close with a concrete next step";
  return `${scoutBit}, ${emailBit}, ${closeBit}.`;
}

function defaultCloseForIntent(intent: PlatformIntent): PreferenceClosePath {
  if (intent === "corporate_gifting" || intent === "appliances") return "send_sample";
  if (intent === "b2b_saas") return "book_call";
  return "book_call";
}

function defaultCtaForIntent(intent: PlatformIntent): string {
  if (intent === "corporate_gifting" || intent === "appliances") return "gift_sampling";
  return "meet_online";
}

function seedExtractFromBrand(brand: BrandConfig): PreferenceExtract {
  const insights = brand.websiteInsights;
  const intent = resolvePlatformIntent(brand.platformIntent, brand.verticalPackId);
  const packId = resolveVerticalPackId(brand.verticalPackId, brand.brandSlug);
  const defaultCta = defaultCtaForIntent(intent);
  const closePath = defaultCloseForIntent(intent);
  return {
    icpSummary: insights?.icpSummary,
    industries: insights?.scoutIndustries?.length ? insights.scoutIndustries : undefined,
    departments: insights?.scoutDepartments?.length ? insights.scoutDepartments : undefined,
    seniority: insights?.scoutSeniority?.length ? insights.scoutSeniority : undefined,
    preferredCtaIds: brand.defaultOutreachCta ? [brand.defaultOutreachCta] : [defaultCta],
    defaultCtaId: brand.defaultOutreachCta ?? defaultCta,
    closePath,
    toneNotes: brand.toneNotes ?? insights?.toneNotes,
    summary: insights?.icpSummary,
  };
}

export function nextCoachBeat(
  brand: BrandConfig,
  extract: PreferenceExtract,
  topics: readonly PreferenceTopic[],
): CoachBeat {
  const intent = resolvePlatformIntent(brand.platformIntent, brand.verticalPackId);
  const pack = getVerticalPack(brand.verticalPackId);
  const icp = extract.icpSummary?.trim() || brand.websiteInsights?.icpSummary?.trim() || "";
  const name = brand.brandName?.trim() || "your company";

  const order: PreferenceTopic[] = ["scout", "leads", "email", "close"];
  const next = order.find((t) => !topics.includes(t)) ?? "close";

  if (next === "scout") {
    const industryChips = extract.industries?.length
      ? extract.industries.slice(0, 4)
      : brand.websiteInsights?.scoutIndustries?.slice(0, 3) ?? ["Manufacturing", "Technology", "FMCG", "Entire India"];
    const recommended = industryChips[0];
    const icpBit = icp ? ` ${icp.slice(0, 120)}${icp.length > 120 ? "…" : ""}` : "";
    return {
      topic: "scout",
      headline: "Who and where should Scout look?",
      coachLine: icp
        ? `From your setup, ${name} sells to:${icpBit} Tap a target below or say your own industries and locations.`
        : `Which industries and locations should Scout prioritise for ${name}?`,
      chips: [...industryChips, "Entire India"],
      recommendedChip: recommended,
    };
  }

  if (next === "leads") {
    const deptChips =
      extract.departments?.length
        ? extract.departments
        : intent === "corporate_gifting"
          ? ["HR", "Procurement", "Admin"]
          : intent === "b2b_saas"
            ? ["Founders", "C-Level", "VP"]
            : ["Directors", "Managers", "Founders"];
    return {
      topic: "leads",
      headline: "Which roles matter most?",
      coachLine: "Pick one stack only: department or seniority. Stacking both often returns nobody.",
      chips: deptChips,
      recommendedChip: deptChips[0],
    };
  }

  if (next === "email") {
    const ctaChips = pack.outreachCtas.slice(0, 3).map((c) => c.label);
    const recommended = pack.outreachCtas.find((c) => c.id === (extract.defaultCtaId ?? defaultCtaForIntent(intent)))?.label ?? ctaChips[0];
    return {
      topic: "email",
      headline: "What should Email 1 ask for?",
      coachLine: `First emails work best with one clear ask. Which fits how ${name} actually sells?`,
      chips: ctaChips,
      recommendedChip: recommended,
    };
  }

  const closeChips = ["Book a call", "Send a sample", "Visit in person", "Share a quote"];
  const recommended = CLOSE_LABELS[extract.closePath ?? defaultCloseForIntent(intent)];
  return {
    topic: "close",
    headline: "How do you usually close?",
    coachLine: "When someone says yes, what is the next step your team takes?",
    chips: closeChips,
    recommendedChip: recommended,
  };
}

export function profileFromExtract(
  prev: UserPreferenceProfile,
  extract: PreferenceExtract,
  messages: PreferenceChatMessage[],
): UserPreferenceProfile {
  const geo = extract.geo ? sanitizeScoutGeo(extract.geo) : undefined;
  return {
    ...prev,
    version: 1,
    source: "onboarding_chat",
    updatedAt: new Date().toISOString(),
    summary: buildPreferenceSummary(extract),
    sellingMotion: extract.sellingMotion?.trim() || prev.sellingMotion,
    toneNotes: extract.toneNotes?.trim() || prev.toneNotes,
    closePath: extract.closePath,
    preferredCtaIds: extract.preferredCtaIds,
    defaultCtaId: extract.defaultCtaId,
    scout: {
      geo: geo && scoutGeoHasSelection(geo) ? geo : undefined,
      industries: extract.industries?.length ? extract.industries : undefined,
      departments: extract.departments?.length ? extract.departments : undefined,
      seniority: extract.seniority?.length ? extract.seniority : undefined,
    },
    messages,
    topicsCovered: topicsCoveredFromExtract(extract),
  };
}

function ctaKeywordForId(ctaId: string): string {
  return CTA_LABEL[ctaId] ?? ctaId.replace(/_/g, " ");
}

function closePathToCta(closePath: PreferenceClosePath): string {
  if (closePath === "send_sample") return "gift_sampling";
  if (closePath === "book_visit") return "meet_in_person";
  return "meet_online";
}

function ensureInsights(brand: BrandConfig) {
  return (
    brand.websiteInsights ?? {
      analyzedAt: new Date().toISOString(),
      vertical: brand.vertical,
      productSummary: brand.productSummary,
      toneNotes: brand.toneNotes ?? "",
      buyerPersonas: brand.buyerPersonas ?? [],
      scoutIndustries: [],
      scoutDepartments: [],
      scoutSeniority: [],
    }
  );
}

export function applyPreferenceExtract(
  brand: BrandConfig,
  extract: PreferenceExtract,
): { brand: BrandConfig; geo: ScoutGeoSelection | null; campaignNotes?: string } {
  const intent = resolvePlatformIntent(brand.platformIntent, brand.verticalPackId);
  const packId = resolveVerticalPackId(brand.verticalPackId, brand.brandSlug);
  const allowed = new Set(getVerticalPack(packId).outreachCtas.map((c) => c.id));

  let defaultCtaId = extract.defaultCtaId ? normalizeOutreachCtaId(extract.defaultCtaId) : "";
  if (!defaultCtaId && extract.preferredCtaIds?.length) defaultCtaId = normalizeOutreachCtaId(extract.preferredCtaIds[0]);
  if (!defaultCtaId && extract.closePath) defaultCtaId = closePathToCta(extract.closePath);
  if (!defaultCtaId || !allowed.has(defaultCtaId)) defaultCtaId = defaultCtaForIntent(intent);

  const roles = normalizeScoutRoleFilters(
    intent,
    extract.departments ?? [],
    extract.seniority ?? [],
  );
  const insights = ensureInsights(brand);
  const industries = extract.industries?.length ? extract.industries : insights.scoutIndustries;
  const toneNotes = extract.toneNotes?.trim() || brand.toneNotes || insights.toneNotes;
  const icpSummary = extract.icpSummary?.trim() || insights.icpSummary;

  const existingKeywords = insights.emailKeywords ?? [];
  const ctaKeyword = ctaKeywordForId(defaultCtaId);
  const emailKeywords = normalizeEmailKeywords([ctaKeyword, ...existingKeywords]);

  const closePath = extract.closePath ?? defaultCloseForIntent(intent);
  const campaignNotes =
    extract.sellingMotion?.trim() ||
    `Close motion: ${CLOSE_LABELS[closePath]}. ${extract.summary?.trim() || ""}`.trim();

  const geo = extract.geo ? sanitizeScoutGeo(extract.geo) : null;

  return {
    brand: {
      ...brand,
      toneNotes,
      defaultOutreachCta: defaultCtaId,
      websiteInsights: {
        ...insights,
        toneNotes,
        icpSummary,
        scoutIndustries: industries,
        scoutDepartments: roles.scoutDepartments,
        scoutSeniority: roles.scoutSeniority,
        emailKeywords,
      },
    },
    geo: geo && scoutGeoHasSelection(geo) ? geo : null,
    campaignNotes,
  };
}

export function openingCoachState(brand: BrandConfig, existingExtract?: PreferenceExtract): {
  extract: PreferenceExtract;
  beat: CoachBeat;
} {
  const seeded = mergePreferenceExtract(seedExtractFromBrand(brand), existingExtract ?? {});
  const topics = topicsCoveredFromExtract(seeded);
  if (isPreferenceReady(topics)) {
    return {
      extract: seeded,
      beat: {
        topic: "close",
        headline: "Your playbook looks ready",
        coachLine: "Review the recap. Tap Apply this playbook when it matches how you sell.",
        chips: [],
      },
    };
  }
  return { extract: seeded, beat: nextCoachBeat(brand, seeded, topics) };
}

export function mapChipToExtract(chip: string, brand: BrandConfig, topic: PreferenceTopic): PreferenceExtract {
  const lower = chip.toLowerCase();
  if (topic === "email") {
    const pack = getVerticalPack(brand.verticalPackId);
    const hit = pack.outreachCtas.find((c) => c.label.toLowerCase() === lower || c.shortLabel.toLowerCase() === lower);
    const id = hit?.id ?? normalizeOutreachCtaId(chip);
    return { preferredCtaIds: [id], defaultCtaId: id };
  }
  if (topic === "close") {
    if (/call/.test(lower)) return { closePath: "book_call", preferredCtaIds: ["meet_online"], defaultCtaId: "meet_online" };
    if (/sample/.test(lower)) return { closePath: "send_sample", preferredCtaIds: ["gift_sampling"], defaultCtaId: "gift_sampling" };
    if (/visit/.test(lower)) return { closePath: "book_visit", preferredCtaIds: ["meet_in_person"], defaultCtaId: "meet_in_person" };
    if (/quote/.test(lower)) return { closePath: "send_quote" };
    return extractPreferencesFromText(chip);
  }
  if (chip === "Entire India") return { geo: { entireIndia: true, regionIds: [], stateIds: [], districtIds: [] } };
  if (SCOUT_DEPARTMENTS.includes(chip as (typeof SCOUT_DEPARTMENTS)[number])) return { departments: [chip] };
  if (SCOUT_SENIORITY.includes(chip as (typeof SCOUT_SENIORITY)[number])) return { seniority: [chip] };
  if (SCOUT_INDUSTRIES.includes(chip as (typeof SCOUT_INDUSTRIES)[number])) return { industries: [chip] };
  return extractPreferencesFromText(chip);
}
