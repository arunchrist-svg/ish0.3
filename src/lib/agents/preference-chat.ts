import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import type { BrandConfig } from "@/lib/email/config";
import { patchWorkspaceBrandConfig } from "@/lib/settings/email-settings";
import { saveWorkspaceEnrichmentOverrides } from "@/lib/settings/workspace-settings";
import { sanitizeScoutGeo, scoutGeoHasSelection } from "@/lib/geo/india";
import {
  applyPreferenceExtract,
  buildPreferenceSummary,
  extractFromProfile,
  extractPreferencesFromText,
  isPreferenceClosePath,
  isPreferenceReady,
  mapChipToExtract,
  mergePreferenceExtract,
  nextCoachBeat,
  normalizeOutreachCtaId,
  openingCoachState,
  parseScoutGeoFromText,
  profileFromExtract,
  topicsCoveredFromExtract,
  type CoachBeat,
  type PreferenceChatMessage,
  type PreferenceExtract,
  type PreferenceTopic,
  type UserPreferenceProfile,
} from "@/lib/settings/preference-profile";

const llmTurnSchema = z.object({
  coachLine: z.string().min(8),
  extract: z
    .object({
      icpSummary: z.string().optional(),
      sellingMotion: z.string().optional(),
      toneNotes: z.string().optional(),
      closePath: z.enum(["book_call", "send_sample", "book_visit", "send_quote"]).nullable().optional(),
      preferredCtaIds: z.array(z.string()).optional(),
      defaultCtaId: z.string().optional(),
      industries: z.array(z.string()).optional(),
      departments: z.array(z.string()).optional(),
      seniority: z.array(z.string()).optional(),
      geoLabels: z.array(z.string()).optional(),
    })
    .optional(),
});

export type PreferenceCoachTurnResult = {
  profile: UserPreferenceProfile;
  beat: CoachBeat;
  summary: string;
  topicsCovered: PreferenceTopic[];
  readyToFinish: boolean;
  preferenceReady: boolean;
  needsLocation: boolean;
  nextStep?: number;
  applied: boolean;
};

function appendMessage(
  messages: PreferenceChatMessage[],
  role: PreferenceChatMessage["role"],
  content: string,
): PreferenceChatMessage[] {
  return [...messages, { role, content: content.trim(), createdAt: new Date().toISOString() }];
}

function extractFromLlm(raw: z.infer<typeof llmTurnSchema>["extract"]): PreferenceExtract {
  if (!raw) return {};
  const geoLabels = (raw.geoLabels ?? []).join(" ");
  const geo = geoLabels ? parseScoutGeoFromText(geoLabels) : null;
  const preferredCtaIds = (raw.preferredCtaIds ?? [])
    .map(normalizeOutreachCtaId)
    .filter((id) => PRIMARY.includes(id as (typeof PRIMARY)[number]));
  return {
    icpSummary: raw.icpSummary?.trim(),
    sellingMotion: raw.sellingMotion?.trim(),
    toneNotes: raw.toneNotes?.trim(),
    closePath: isPreferenceClosePath(raw.closePath) ? raw.closePath : undefined,
    preferredCtaIds: preferredCtaIds.length ? preferredCtaIds : undefined,
    defaultCtaId: raw.defaultCtaId ? normalizeOutreachCtaId(raw.defaultCtaId) : preferredCtaIds[0],
    industries: raw.industries,
    departments: raw.departments,
    seniority: raw.seniority,
    geo,
  };
}

const PRIMARY = ["meet_online", "gift_sampling", "meet_in_person"] as const;

async function llmCoachRefine(params: {
  brand: BrandConfig;
  userText: string;
  extract: PreferenceExtract;
  tenantId?: string;
  workspaceId?: string;
}): Promise<PreferenceExtract | null> {
  const prompt = `Extract seller preferences from this onboarding coach answer. Ground in facts only. No invented products. No em dashes.

Brand: ${params.brand.brandName}
Product: ${params.brand.productSummary || "(none)"}
ICP: ${params.brand.websiteInsights?.icpSummary || "(none)"}
Known extract: ${JSON.stringify(params.extract)}
User answer: ${params.userText}

Return ONLY JSON:
{
  "extract": {
    "icpSummary": "optional restated buyer profile",
    "sellingMotion": "optional close motion in their words",
    "toneNotes": "optional writing notes to always remember",
    "closePath": "book_call|send_sample|book_visit|send_quote|null",
    "preferredCtaIds": ["meet_online","gift_sampling","meet_in_person"],
    "defaultCtaId": "meet_online",
    "industries": ["Technology"],
    "departments": ["HR"],
    "seniority": ["Director"],
    "geoLabels": ["Karnataka"]
  }
}`;

  try {
    const raw = await callLLM({
      tier: tierForAgentStep("preference.chat"),
      system: "You output only valid JSON. No markdown fences.",
      prompt,
      maxTokens: 500,
      trace:
        params.tenantId && params.workspaceId
          ? {
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
              agent: "preference-chat",
              promptVersion: "preference-coach-v1",
            }
          : undefined,
    });
    const parsed = llmTurnSchema.safeParse(parseJsonObjectFromLLM(raw));
    if (!parsed.success) return null;
    return extractFromLlm(parsed.data.extract);
  } catch (e) {
    console.warn("[preference-coach] LLM extract failed:", e);
    return null;
  }
}

export async function runPreferenceCoachTurn(params: {
  profile: UserPreferenceProfile;
  brand: BrandConfig;
  enrichment?: { scoutGeo?: import("@/lib/geo/india").ScoutGeoSelection };
  message?: string;
  chip?: string;
  finish?: boolean;
  tenantId?: string;
  workspaceId?: string;
}): Promise<PreferenceCoachTurnResult> {
  let extract = extractFromProfile(params.profile);
  let messages = params.profile.messages;

  if (messages.length === 0 && !params.message && !params.chip && !params.finish) {
    const opening = openingCoachState(params.brand, extractFromProfile(params.profile));
    extract = opening.extract;
    const assistantLine = opening.beat.coachLine;
    messages = appendMessage([], "assistant", assistantLine);
    const profile = profileFromExtract(params.profile, extract, messages);
    return {
      profile,
      beat: opening.beat,
      summary: profile.summary || buildPreferenceSummary(extract),
      topicsCovered: profile.topicsCovered,
      readyToFinish: isPreferenceReady(profile.topicsCovered),
      preferenceReady: false,
      needsLocation: !scoutGeoHasSelection(sanitizeScoutGeo(params.enrichment?.scoutGeo)),
      applied: false,
    };
  }

  if (params.message?.trim() || params.chip?.trim()) {
    const userText = (params.chip?.trim() || params.message?.trim())!;
    const topicsBefore = topicsCoveredFromExtract(extract);
    const topic = (["scout", "leads", "email", "close"] as PreferenceTopic[]).find((t) => !topicsBefore.includes(t)) ?? "close";

    let patch = params.chip ? mapChipToExtract(params.chip, params.brand, topic) : extractPreferencesFromText(userText);
    if (params.message?.trim() && !params.chip) {
      const llmPatch = await llmCoachRefine({
        brand: params.brand,
        userText,
        extract,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });
      patch = mergePreferenceExtract(patch, llmPatch ?? {});
    }
    extract = mergePreferenceExtract(extract, patch);
    messages = appendMessage(appendMessage(messages, "user", userText), "assistant", "");
  }

  const topicsCovered = topicsCoveredFromExtract(extract);
  const readyToFinish = isPreferenceReady(topicsCovered);
  const beat = nextCoachBeat(params.brand, extract, topicsCovered);
  const existingGeo = sanitizeScoutGeo(params.enrichment?.scoutGeo);
  let needsLocation = !(
    (extract.geo && scoutGeoHasSelection(sanitizeScoutGeo(extract.geo))) ||
    scoutGeoHasSelection(existingGeo)
  );

  let profile = profileFromExtract(params.profile, extract, messages);
  if (messages.length && messages[messages.length - 1]?.role === "assistant") {
    profile = {
      ...profile,
      messages: profile.messages.map((msg, index) =>
        index === profile.messages.length - 1 && msg.role === "assistant"
          ? { ...msg, content: beat.coachLine }
          : msg,
      ),
    };
  }

  if (params.finish) {
    if (!readyToFinish) {
      return {
        profile,
        beat,
        summary: profile.summary,
        topicsCovered,
        readyToFinish: false,
        preferenceReady: false,
        needsLocation,
        applied: false,
      };
    }

    const applied = applyPreferenceExtract(params.brand, extract);
    await patchWorkspaceBrandConfig(applied.brand, params.workspaceId, {
      campaignNotes: applied.campaignNotes,
    });
    if (applied.geo) {
      await saveWorkspaceEnrichmentOverrides({ scoutGeo: applied.geo });
      needsLocation = false;
    } else {
      needsLocation = !scoutGeoHasSelection(existingGeo);
    }
    profile = profileFromExtract(profile, extract, profile.messages);

    return {
      profile,
      beat: {
        topic: "close",
        headline: "Playbook applied",
        coachLine: "Scout, Writer, and your first-email ask now follow what you confirmed.",
        chips: [],
      },
      summary: profile.summary,
      topicsCovered,
      readyToFinish: true,
      preferenceReady: true,
      needsLocation,
      nextStep: needsLocation ? 3 : 4,
      applied: true,
    };
  }

  return {
    profile,
    beat,
    summary: profile.summary,
    topicsCovered,
    readyToFinish,
    preferenceReady: readyToFinish,
    needsLocation,
    applied: false,
  };
}
