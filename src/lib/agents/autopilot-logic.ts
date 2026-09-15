import {
  generateEmailPermutations,
  resolveAccountDomain,
  resolveContactName,
} from "@/lib/enrichment/email-permutations";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";
import type { AutopilotRunProgress, AutopilotRunStatus, AutopilotSchedule } from "@/db";
import { getZonedParts } from "@/lib/email/send-window-parts";

export const AUTOPILOT_TARGET_COMPANIES = 100;
export const AUTOPILOT_TARGET_LEADS = 100;
export const AUTOPILOT_CHUNK_SIZE = 10;
export const AUTOPILOT_PEOPLE_PER_COMPANY = 1;
export const AUTOPILOT_DEFAULT_SENIORITY = ["Manager", "Director"];
export const AUTOPILOT_DEFAULT_DEPARTMENTS = ["HR", "Procurement"];
export const AUTOPILOT_LEAD_SOURCE = "scout_autopilot";
/** Credit backstop only. Empty pages keep running until 100 leads. */
export const AUTOPILOT_EMPTY_PAGE_LIMIT = 30;
/** Extra company pages inside one chunk until we actually save new leads. */
export const AUTOPILOT_MAX_DISCOVERY_PASSES = 6;
/** Cap people lookups per chunk so a dry city cannot burn the whole Tavily pool. */
export const AUTOPILOT_MAX_TRIES_PER_CHUNK = 40;

/** Default for new workflow bots: queue Email 1 after drafts. */
export const AUTOPILOT_SENDS_EMAIL = true;
/** Fallback template when the bot does not pick one. */
export const AUTOPILOT_OUTREACH_TEMPLATE = "prasanth_sequence";

export const DEFAULT_AUTOPILOT_SCHEDULE: AutopilotSchedule = {
  daysOfWeek: [1, 2, 3, 4, 5],
  hour: 9,
  minute: 0,
  timezone: "Asia/Kolkata",
};

export function autopilotSendsEmail(autoSend?: boolean): boolean {
  return autoSend === true;
}

export function normalizeAutopilotSchedule(raw?: Partial<AutopilotSchedule> | null): AutopilotSchedule {
  const days = (raw?.daysOfWeek ?? DEFAULT_AUTOPILOT_SCHEDULE.daysOfWeek)
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const hour = Number(raw?.hour);
  const minute = Number(raw?.minute);
  return {
    daysOfWeek: days.length ? [...new Set(days)] : [...DEFAULT_AUTOPILOT_SCHEDULE.daysOfWeek],
    hour: Number.isInteger(hour) ? Math.min(23, Math.max(0, hour)) : DEFAULT_AUTOPILOT_SCHEDULE.hour,
    minute: Number.isInteger(minute) ? Math.min(59, Math.max(0, minute)) : DEFAULT_AUTOPILOT_SCHEDULE.minute,
    timezone: typeof raw?.timezone === "string" && raw.timezone.trim() ? raw.timezone.trim() : DEFAULT_AUTOPILOT_SCHEDULE.timezone,
  };
}

/** True when local time is in the same 15-minute slot as the bot schedule. */
export function isAutopilotScheduleDue(
  schedule: AutopilotSchedule | undefined,
  now: Date,
  lastScheduledAt?: string | null,
): boolean {
  if (!schedule?.daysOfWeek?.length) return false;
  const tz = schedule.timezone || DEFAULT_AUTOPILOT_SCHEDULE.timezone;
  const parts = getZonedParts(now, tz);
  if (!schedule.daysOfWeek.includes(parts.weekday)) return false;
  const scheduledMinutes = schedule.hour * 60 + schedule.minute;
  const nowMinutes = parts.hour * 60 + parts.minute;
  if (nowMinutes < scheduledMinutes || nowMinutes >= scheduledMinutes + 15) return false;
  if (lastScheduledAt) {
    const last = getZonedParts(new Date(lastScheduledAt), tz);
    if (last.year === parts.year && last.month === parts.month && last.day === parts.day) {
      const lastMinutes = last.hour * 60 + last.minute;
      if (lastMinutes >= scheduledMinutes && lastMinutes < scheduledMinutes + 15) return false;
    }
  }
  return true;
}

export function parseAutopilotBatchRunId(batchId?: string | null): string | null {
  const match = /^autopilot:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(batchId ?? "");
  return match?.[1] ?? null;
}

export type DailyAutopilotPlan =
  | { action: "none" }
  | { action: "skip_live" }
  | { action: "resume"; runId: string }
  | { action: "start_new"; sourceRunId: string };

export function planDailyAutopilotAction(
  runs: Array<{
    id: string;
    status: AutopilotRunStatus;
    leadsSaved: number;
    targetLeads: number;
  }>,
): DailyAutopilotPlan {
  if (!runs.length) return { action: "none" };
  if (runs.some((run) => run.status === "queued" || run.status === "running")) {
    return { action: "skip_live" };
  }
  const continuable = runs.find(
    (run) => run.status !== "completed" && run.leadsSaved < run.targetLeads,
  );
  if (continuable) return { action: "resume", runId: continuable.id };
  const finished = runs.find(
    (run) =>
      run.leadsSaved >= run.targetLeads ||
      run.status === "awaiting_approval" ||
      run.status === "completed",
  );
  if (finished) return { action: "start_new", sourceRunId: finished.id };
  return { action: "none" };
}

export function planNextAutopilotChunk(params: {
  targetCompanies: number;
  chunkSize: number;
  companiesSaved: number;
  targetLeads?: number;
  leadsSaved?: number;
}): number {
  const targetLeads = params.targetLeads ?? AUTOPILOT_TARGET_LEADS;
  const leadsSaved = params.leadsSaved ?? 0;
  if (leadsSaved >= targetLeads) return 0;
  const leadGap = targetLeads - leadsSaved;
  return Math.min(params.chunkSize, leadGap);
}

/** Keep scouting inside the chunk until we save new companies and new leads. */
export function shouldFillAutopilotChunk(input: {
  leadsSavedThisChunk: number;
  chunkSize: number;
  discoveryPasses: number;
  companiesTriedThisChunk: number;
  tavilyDead?: boolean;
}): boolean {
  if (input.tavilyDead) return false;
  if (input.leadsSavedThisChunk >= input.chunkSize) return false;
  if (input.discoveryPasses >= AUTOPILOT_MAX_DISCOVERY_PASSES) return false;
  if (input.companiesTriedThisChunk >= AUTOPILOT_MAX_TRIES_PER_CHUNK) return false;
  return true;
}

export function autopilotExcludeNames(progress: Pick<AutopilotRunProgress, "companyNames" | "skipped" | "attemptedNames">): string[] {
  const skippedCompanies = (progress.skipped ?? [])
    .map((item) => item.name.split(":")[0]?.trim())
    .filter((name): name is string => Boolean(name));
  return [
    ...new Set([
      ...(progress.companyNames ?? []),
      ...(progress.attemptedNames ?? []),
      ...skippedCompanies,
    ]),
  ];
}

export function isAutopilotTavilyExhausted(messages: string[]): boolean {
  return messages.some(
    (msg) =>
      /all tavily keys exhausted|tavily keys are exhausted|tavily(?: api)? quota exceeded|people search needs tavily credits/i.test(
        msg,
      ) &&
      !/rate.?limit|credits are still available|switched to (?:backup|next) key|switched to google places|switched to apollo/i.test(
        msg,
      ),
  );
}

export function companyDedupeReason(input: {
  alreadyOnThisRun?: boolean;
  hasBoardLead?: boolean;
  emailedThisMonth?: boolean;
  hasActiveSequence?: boolean;
}): string | null {
  if (input.alreadyOnThisRun) return "already on this Autopilot run";
  if (input.hasBoardLead) return "already on the board";
  if (input.hasActiveSequence) return "active sequence";
  if (input.emailedThisMonth) return "emailed this company this month";
  return null;
}

export function guessPersonEmail(
  person: Pick<ScoutPersonResult, "name" | "firstName" | "lastName" | "email">,
  company: Pick<ScoutCompanyResult, "name" | "domain" | "website">,
): string | undefined {
  if (person.email?.includes("@")) return person.email.trim();
  const domain = resolveAccountDomain({
    domain: company.domain,
    website: company.website,
    companyName: company.name,
  });
  if (!domain) return undefined;
  const { firstName, lastName } = resolveContactName({
    firstName: person.firstName,
    lastName: person.lastName,
    name: person.name,
  });
  return generateEmailPermutations({ firstName, lastName, domain })[0]?.email;
}

export function applyGuessedEmail(
  person: ScoutPersonResult,
  company: Pick<ScoutCompanyResult, "name" | "domain" | "website">,
): ScoutPersonResult {
  if (person.email?.includes("@")) return person;
  const guessed = guessPersonEmail(person, company);
  if (!guessed) return person;
  return { ...person, email: guessed, emailStatus: "unverified" };
}

export type AutopilotChunkDecision = {
  nextStatus: AutopilotRunStatus;
  enqueueNext: boolean;
  enqueueWriter: boolean;
  nextChunkIndex?: number;
  error?: string;
};

export function decideAfterAutopilotChunk(input: {
  enabled: boolean;
  creditError?: boolean;
  tavilyExhausted: boolean;
  companiesDiscovered: number;
  peopleFound: number;
  allCompaniesDeduped: boolean;
  leadsSavedTotal: number;
  targetLeads: number;
  companiesSavedTotal: number;
  targetCompanies: number;
  chunkIndex: number;
  chunkSize: number;
  attemptedCount?: number;
  emptyDiscoveryStreak?: number;
  autoSend?: boolean;
}): AutopilotChunkDecision {
  if (!input.enabled) {
    return { nextStatus: "paused", enqueueNext: false, enqueueWriter: false, error: "Autopilot is paused." };
  }
  if (input.creditError) {
    return {
      nextStatus: "paused",
      enqueueNext: false,
      enqueueWriter: false,
      error: "Insufficient credits. Autopilot paused. Earlier leads are kept.",
    };
  }
  if (input.tavilyExhausted) {
    return {
      nextStatus: "paused",
      enqueueNext: false,
      enqueueWriter: input.leadsSavedTotal > 0,
      error: "Tavily credits ran out. Autopilot paused. Add credits, then tap Continue.",
    };
  }

  const hitLeadCap = input.leadsSavedTotal >= input.targetLeads;
  const remaining = planNextAutopilotChunk({
    targetCompanies: input.targetCompanies,
    chunkSize: input.chunkSize,
    companiesSaved: input.companiesSavedTotal,
    targetLeads: input.targetLeads,
    leadsSaved: input.leadsSavedTotal,
  });

  if (hitLeadCap || remaining === 0) {
    return {
      nextStatus: autopilotSendsEmail(input.autoSend) ? "completed" : "awaiting_approval",
      enqueueNext: false,
      enqueueWriter: input.leadsSavedTotal > 0,
    };
  }

  const emptyStreak = input.emptyDiscoveryStreak ?? 0;
  if (emptyStreak >= AUTOPILOT_EMPTY_PAGE_LIMIT) {
    return {
      nextStatus: "paused",
      enqueueNext: false,
      enqueueWriter: input.leadsSavedTotal > 0,
      error:
        "Paused after many empty search pages to save credits. Tap Continue to keep searching.",
    };
  }

  return {
    nextStatus: "running",
    enqueueNext: true,
    enqueueWriter: input.peopleFound > 0,
    nextChunkIndex: input.chunkIndex + 1,
  };
}

export function mergeAutopilotProgress(
  prev: AutopilotRunProgress,
  patch: Partial<AutopilotRunProgress> & {
    newLeadIds?: string[];
    newCompanyNames?: string[];
    newAttemptedNames?: string[];
    newSkipped?: AutopilotRunProgress["skipped"];
  },
): AutopilotRunProgress {
  const leadIds = [...new Set([...(prev.leadIds ?? []), ...(patch.newLeadIds ?? []), ...(patch.leadIds ?? [])])];
  const companyNames = [
    ...new Set([...(prev.companyNames ?? []), ...(patch.newCompanyNames ?? []), ...(patch.companyNames ?? [])]),
  ];
  const attemptedNames = [
    ...new Set([
      ...(prev.attemptedNames ?? []),
      ...(patch.newAttemptedNames ?? []),
      ...(patch.attemptedNames ?? []),
    ]),
  ];
  return {
    chunkIndex: patch.chunkIndex ?? prev.chunkIndex,
    companiesSaved: patch.companiesSaved ?? companyNames.length,
    leadsSaved: patch.leadsSaved ?? leadIds.length,
    leadIds,
    companyNames,
    attemptedNames,
    emptyDiscoveryStreak: patch.emptyDiscoveryStreak ?? prev.emptyDiscoveryStreak ?? 0,
    skipped: [...(prev.skipped ?? []), ...(patch.newSkipped ?? []), ...(patch.skipped ?? [])].slice(-200),
    lastError: patch.lastError === undefined ? prev.lastError : patch.lastError,
    lastScheduledAt: patch.lastScheduledAt === undefined ? prev.lastScheduledAt : patch.lastScheduledAt,
  };
}

export function resolveAutopilotPeopleFilters(input: {
  seniority?: string[];
  departments?: string[];
}): { seniority: string[]; departments: string[] } {
  return {
    seniority: input.seniority == null ? AUTOPILOT_DEFAULT_SENIORITY : input.seniority,
    departments: input.departments == null ? AUTOPILOT_DEFAULT_DEPARTMENTS : input.departments,
  };
}

/** People search must use one city. Plant LinkedIn queries only keep the first two chips. */
export function autopilotPeopleCities(
  company: { city?: string | null },
  focusCity: string[],
): string[] {
  const city = company.city?.trim();
  if (city && !/^india$/i.test(city)) return [city];
  return focusCity.map((item) => item.trim()).filter(Boolean);
}

/** Company search uses three industries at a time so 18 chips do not collapse to one query. */
export function autopilotFocusIndustries(
  industries: string[],
  chunkIndex: number,
  cityCount: number,
): string[] {
  const cleaned = industries.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length <= 3) return cleaned;
  const offset = (Math.floor(chunkIndex / Math.max(cityCount, 1)) * 3) % cleaned.length;
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const item = cleaned[(offset + i) % cleaned.length]!;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function autopilotPeopleSkipReason(messages: string[]): string {
  if (isAutopilotTavilyExhausted(messages)) {
    return "people search paused: Tavily credits ran out";
  }
  if (messages.some((msg) => /seniority and department|no hr, procurement, admin/i.test(msg))) {
    return "no HR, Admin, or Procurement person found";
  }
  return "no decision-makers in plant or nearby HQ";
}
