import type { CompanyOverview, CompanyOverviewInput, CompanyOverviewResult } from "./company-overview";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "./enrichment/types";
import { cachedFetch, invalidateCached } from "@/lib/client-fetch-cache";

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "AbortError" || /aborted|abort(ed)? the request/i.test(message);
}

export class InsufficientCreditsApiError extends Error {
  code = "INSUFFICIENT_CREDITS" as const;
  required?: number;
  available?: number;

  constructor(message: string, required?: number, available?: number) {
    super(message);
    this.name = "InsufficientCreditsApiError";
    this.required = required;
    this.available = available;
  }
}

export class QualityGateApiError extends Error {
  code = "QUALITY_GATE_FAILED" as const;
  canOverride: boolean;

  constructor(message: string, canOverride = true) {
    super(message);
    this.name = "QualityGateApiError";
    this.canOverride = canOverride;
  }
}

export type SenderPreflightIssue = { id: string; label: string; severity: string };

export class SenderPreflightApiError extends Error {
  code = "SENDER_PREFLIGHT_FAILED" as const;
  issues: SenderPreflightIssue[];
  canOverride: boolean;

  constructor(message: string, issues: SenderPreflightIssue[], canOverride: boolean) {
    super(message);
    this.name = "SenderPreflightApiError";
    this.issues = issues;
    this.canOverride = canOverride;
  }
}

export class EmailSendRejectedError extends Error {
  code = "email_send_rejected" as const;
  rejectedEmail: string;
  nextEmail?: string;
  canRetry: boolean;

  constructor(message: string, rejectedEmail: string, nextEmail?: string, canRetry = false) {
    super(message);
    this.name = "EmailSendRejectedError";
    this.rejectedEmail = rejectedEmail;
    this.nextEmail = nextEmail;
    this.canRetry = canRetry;
  }
}

function throwFromErrorBody(err: Record<string, unknown>, statusText: string): never {
  const code = typeof err.code === "string" ? err.code : "";
  const message = typeof err.error === "string" ? err.error : statusText;
  if (code === "INSUFFICIENT_CREDITS") {
    throw new InsufficientCreditsApiError(
      message,
      typeof err.required === "number" ? err.required : undefined,
      typeof err.available === "number" ? err.available : undefined,
    );
  }
  if (code === "SENDER_PREFLIGHT_FAILED") {
    throw new SenderPreflightApiError(
      message,
      (err.issues as SenderPreflightIssue[]) ?? [],
      err.canOverride !== false,
    );
  }
  if (code === "QUALITY_GATE_FAILED" || code === "FOLLOWUP_QUALITY_FAILED") {
    throw new QualityGateApiError(message, err.canOverride !== false);
  }
  if (code === "email_send_rejected") {
    throw new EmailSendRejectedError(
      message,
      typeof err.rejectedEmail === "string" ? err.rejectedEmail : "",
      typeof err.nextEmail === "string" ? err.nextEmail : undefined,
      Boolean(err.canRetry),
    );
  }
  throw new Error(message);
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throwFromErrorBody(err, res.statusText);
  }
  return res.json();
}


async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throwFromErrorBody(err, res.statusText);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throwFromErrorBody(err, res.statusText);
  }
  return res.json();
}

function invalidateLeadCaches(leadId?: string) {
  invalidateCached("/api/leads?");
  if (leadId) invalidateCached(`/api/leads/${leadId}`);
  else invalidateCached("/api/leads/");
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throwFromErrorBody(err, res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}


// ─── Company Overview ─────────────────────────────────────────────────────────
export type { CompanyOverview, CompanyOverviewInput, CompanyOverviewResult, PastGiftingBrand } from "./company-overview";

export async function fetchCompanyOverview(
  params: CompanyOverviewInput,
): Promise<CompanyOverviewResult> {
  return post<CompanyOverviewResult>("/api/companies/overview", params);
}


export type ScoutCompaniesResponse = {
  companies: ScoutCompanyResult[];
  hasMore: boolean;
  limit: number;
  warnings?: string[];
  errors?: string[];
};

export async function scoutCompanies(params: {
  cities: string[];
  industries: string[];
  dataMode: DataMode;
  seniority?: string[];
  departments?: string[];
  excludeNames?: string[];
  excludeSavedAccounts?: boolean;
  skipInternal?: boolean;
  fetchSeed?: number;
  limit?: number;
  companyName?: string;
  employeeBands?: string[];
  locationScope?: "focus" | "interest";
  searchKind?: "industry" | "business";
  signal?: AbortSignal;
}): Promise<ScoutCompaniesResponse> {
  const { signal, ...body } = params;
  return post<ScoutCompaniesResponse>("/api/scout/companies", body, signal);
}

export type ScoutCompaniesStreamEvent =
  | { type: "partial"; companies: ScoutCompanyResult[]; limit: number }
  | ({ type: "done" } & ScoutCompaniesResponse);

export async function scoutCompaniesStream(
  params: {
    cities: string[];
    industries: string[];
    dataMode: DataMode;
    seniority?: string[];
    departments?: string[];
    excludeNames?: string[];
    excludeSavedAccounts?: boolean;
    skipInternal?: boolean;
    fetchSeed?: number;
    limit?: number;
    companyName?: string;
    employeeBands?: string[];
    locationScope?: "focus" | "interest";
    searchKind?: "industry" | "business";
    signal?: AbortSignal;
  },
  onEvent: (event: ScoutCompaniesStreamEvent) => void,
): Promise<ScoutCompaniesResponse> {
  const { signal, ...body } = params;
  const res = await fetch("/api/scout/companies?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (!res.body) throw new Error("Empty company stream response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneEvent: ScoutCompaniesResponse | null = null;

  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as ScoutCompaniesStreamEvent;
    onEvent(chunk);
    if (chunk.type === "done") {
      doneEvent = {
        companies: chunk.companies,
        hasMore: chunk.hasMore,
        limit: chunk.limit,
        warnings: chunk.warnings,
        errors: chunk.errors,
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);

  return (
    doneEvent ?? {
      companies: [],
      hasMore: false,
      limit: params.limit ?? 0,
      warnings: [],
      errors: ["Company discovery stream ended without a final result"],
    }
  );
}

export type ScoutPeopleResponse = {
  people: ScoutPersonResult[];
  warnings?: string[];
  errors?: string[];
  resolvedDomain?: string;
  resolvedWebsite?: string;
};

export async function scoutPeople(params: {
  companyName: string;
  companyDomain?: string;
  companyWebsite?: string;
  dataMode: DataMode;
  limit?: number;
  seniority?: string[];
  departments?: string[];
  cities?: string[];
  peopleCities?: string[];
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
  signal?: AbortSignal;
}): Promise<ScoutPeopleResponse> {
  const { signal, ...body } = params;
  return post<ScoutPeopleResponse>("/api/scout/people", body, signal);
}


export type ScoutPeopleBatchResponse = {
  results: Record<string, ScoutPeopleResponse>;
};

export async function scoutPeopleBatch(params: {
  companies: {
    id: string;
    name: string;
    domain?: string;
    website?: string;
  }[];
  dataMode: DataMode;
  limit?: number;
  seniority?: string[];
  departments?: string[];
  cities?: string[];
  peopleCities?: string[];
  searchKind?: "industry" | "business";
  businesses?: string[];
  locationScope?: "focus" | "interest";
}): Promise<ScoutPeopleBatchResponse> {
  return post<ScoutPeopleBatchResponse>("/api/scout/people/batch", params);
}


export async function scoutPeopleBatchStream(
  params: {
    companies: {
      id: string;
      name: string;
      domain?: string;
      website?: string;
    }[];
    dataMode: DataMode;
    limit?: number;
    seniority?: string[];
    departments?: string[];
    cities?: string[];
    peopleCities?: string[];
    searchKind?: "industry" | "business";
    businesses?: string[];
    locationScope?: "focus" | "interest";
    signal?: AbortSignal;
  },
  onResult: (companyId: string, result: ScoutPeopleResponse) => void,
): Promise<void> {
  const { signal, ...body } = params;
  const res = await fetch("/api/scout/people/batch?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (!res.body) throw new Error("Empty batch stream response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as { id: string } & ScoutPeopleResponse;
      onResult(chunk.id, chunk);
    }
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer) as { id: string } & ScoutPeopleResponse;
    onResult(chunk.id, chunk);
  }
}

export async function scoutSave(params: {
  people: ScoutPersonResult[];
  company: ScoutCompanyResult;
  dataMode?: DataMode;
}): Promise<{ saved: { leadId: string; name: string; emailStatus: string }[]; skipped: { name: string; reason: string }[] }> {
  return post("/api/scout/save", params);
}

export async function scoutSaveCompanies(params: {
  companies: ScoutCompanyResult[];
  dataMode?: DataMode;
}): Promise<{ saved: number; results: ScoutSaveBatchResult[] }> {
  const body = await post<{ saved?: number; results: ScoutSaveBatchResult[] }>("/api/scout/save/batch", {
    companies: params.companies.map((company, index) => ({
      id: company.externalId ?? `${company.name}-${index}`,
      company,
      people: [],
    })),
    dataMode: params.dataMode,
  });
  return {
    saved: body.saved ?? body.results.length,
    results: body.results,
  };
}

export async function scoutSavedCompanies(): Promise<{ companies: ScoutCompanyResult[] }> {
  return get("/api/scout/saved-companies");
}

export type ScoutSessionSummary = {
  id: string;
  title: string;
  mode: "autopilot" | "search";
  companyCount: number;
  peopleCount: number;
  filters: import("@/db").ScoutSessionFilters;
  createdAt: string;
  updatedAt: string;
};

export type ScoutSessionDetail = ScoutSessionSummary & {
  companies: ScoutCompanyResult[];
  people: import("@/db").ScoutSessionPerson[];
  uiState: import("@/db").ScoutSessionUiState;
  warnings: string[];
  createdByUserId: string | null;
};

export async function scoutListSessions(): Promise<{ sessions: ScoutSessionSummary[] }> {
  return get("/api/scout/sessions");
}

export async function scoutGetSession(id: string): Promise<{ session: ScoutSessionDetail }> {
  return get(`/api/scout/sessions/${id}`);
}

export async function scoutCreateSession(params: {
  mode: "autopilot" | "search";
  filters: import("@/db").ScoutSessionFilters;
  companies?: ScoutCompanyResult[];
  people?: import("@/db").ScoutSessionPerson[];
  uiState?: import("@/db").ScoutSessionUiState;
  warnings?: string[];
  title?: string;
}): Promise<{ session: ScoutSessionDetail }> {
  return post("/api/scout/sessions", params);
}

export async function scoutUpdateSession(
  id: string,
  params: {
    mode?: "autopilot" | "search";
    filters?: import("@/db").ScoutSessionFilters;
    companies?: ScoutCompanyResult[];
    people?: import("@/db").ScoutSessionPerson[];
    uiState?: import("@/db").ScoutSessionUiState;
    warnings?: string[];
    title?: string;
  },
): Promise<{ session: ScoutSessionDetail }> {
  return patch(`/api/scout/sessions/${id}`, params);
}

export async function scoutDeleteSession(id: string): Promise<{ ok: boolean }> {
  return del(`/api/scout/sessions/${id}`);
}

export type ScoutBootstrapCompany = {
  id: string;
  name: string;
  domain?: string | null;
  city?: string | null;
};

export type ScoutBootstrapPayload = {
  /** Compact dedupe entries: key is `company|name` lowercase. */
  dedupeKeys?: { id: string; key: string; name?: string; company?: string }[];
  /** Lead id by dedupe key (`name|company` lowercase). */
  dedupeLeadIds?: Record<string, string>;
  /** @deprecated Prefer dedupeKeys. Kept for older clients. */
  leads?: { id: string; name: string; company: string }[];
  companies: ScoutBootstrapCompany[] | ScoutCompanyResult[];
  dataMode?: DataMode;
  scoutCompaniesLimit?: number;
  scoutLeadsLimit?: number;
  scoutPeopleCities?: string[];
  scoutGeo?: import("@/lib/geo/india").ScoutGeoSelection;
  scoutAreaOfFocus?: import("@/lib/geo/area-of-focus").ScoutAreaOfFocus | null;
  scoutAreasOfFocus?: import("@/lib/geo/area-of-focus").ScoutAreaOfFocus[];
  scope?: import("@/lib/geo/india").ScoutLocationScope;
  locations?: import("@/lib/geo/india").ScoutLocationOption[];
  focusLocations?: import("@/lib/geo/india").ScoutLocationOption[];
  interestLocations?: import("@/lib/geo/india").ScoutLocationOption[];
};

export async function scoutBootstrap(): Promise<ScoutBootstrapPayload> {
  return get("/api/scout/bootstrap");
}

export type ScoutSaveBatchResult = {
  id: string;
  saved: { leadId: string; name: string; emailStatus: string }[];
  skipped: { name: string; reason: string }[];
  error?: string;
};

export async function scoutSaveBatchStream(
  params: {
    companies: {
      id: string;
      company: ScoutCompanyResult;
      people: ScoutPersonResult[];
    }[];
    dataMode?: DataMode;
  },
  onResult: (result: ScoutSaveBatchResult) => void,
): Promise<void> {
  const res = await fetch("/api/scout/save/batch?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (!res.body) throw new Error("Empty save batch stream response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line) as ScoutSaveBatchResult;
      onResult(chunk);
    }
  }
  if (buffer.trim()) {
    onResult(JSON.parse(buffer) as ScoutSaveBatchResult);
  }
}

export type ScoutBatchResult = {
  runId: string;
  companiesDiscovered: number;
  leadsSaved: number;
  leadsSkipped: number;
  errors: string[];
};

export async function runScoutAgent(params: {
  cities?: string[];
  industries?: string[];
  dataMode?: DataMode;
  companyLimit?: number;
  maxCompaniesToProcess?: number;
}): Promise<ScoutBatchResult> {
  return post<ScoutBatchResult>("/api/agents/scout/run", params);
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export type LeadsPage = {
  leads: LeadQueueItem[];
  nextCursor: string | null;
  totals?: { leads: number };
};

export async function fetchLeads(params?: {
  status?: string;
  limit?: number;
  cursor?: string | null;
  totals?: boolean;
}): Promise<LeadQueueItem[]> {
  const page = await fetchLeadsPage(params);
  return page.leads;
}

export async function fetchLeadsPage(params?: {
  status?: string;
  limit?: number;
  cursor?: string | null;
  totals?: boolean;
  force?: boolean;
}): Promise<LeadsPage> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 50));
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.totals) qs.set("totals", "1");
  const path = `/api/leads?${qs.toString()}`;
  // Cache first page only; paginated pages stay uncached to avoid stale appends.
  const useCache = !params?.cursor;
  const data = useCache
    ? await cachedFetch(
        path,
        () => get<{ leads: LeadQueueItem[]; nextCursor?: string | null; totals?: { leads: number } }>(path),
        { force: params?.force },
      )
    : await get<{ leads: LeadQueueItem[]; nextCursor?: string | null; totals?: { leads: number } }>(path);
  return {
    leads: data.leads,
    nextCursor: data.nextCursor ?? null,
    totals: data.totals,
  };
}

export async function fetchLead(id: string, opts?: { force?: boolean }): Promise<LeadDetailRecord> {
  const path = `/api/leads/${id}`;
  const data = await cachedFetch(path, () => get<{ lead: LeadDetailRecord }>(path), {
    ttlMs: 20_000,
    force: opts?.force,
  });
  return data.lead;
}

export type WriterMode = "standard" | "ai";

export async function runWriter(
  leadId: string,
  options?: { outreachTemplate?: string; mode?: "sequence" | "single"; writerMode?: WriterMode; occasionTheme?: string | null },
): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft; drafts?: WriterDraft[] }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    mode: options?.mode ?? "sequence",
    writerMode: options?.writerMode,
    occasionTheme: options?.occasionTheme,
  });
  return data.draft;
}



export async function runWriterStream(
  leadId: string,
  options?: { outreachTemplate?: string; writerMode?: WriterMode; occasionTheme?: string | null },
  onEvent?: (event: { type: string; message?: string; draft?: WriterDraft; code?: string }) => void,
): Promise<WriterDraft> {
  const res = await fetch("/api/agents/writer/run/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId,
      outreachTemplate: options?.outreachTemplate,
      writerMode: options?.writerMode,
      occasionTheme: options?.occasionTheme,
    }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalDraft: WriterDraft | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.slice(5).trim()) as { type: string; message?: string; draft?: WriterDraft; code?: string };
      onEvent?.(payload);
      if (payload.type === "complete" && payload.draft) finalDraft = payload.draft;
      if (payload.type === "error") throw new Error(payload.message ?? "Writer failed");
    }
  }

  if (!finalDraft) throw new Error("Writer stream ended without a draft");
  invalidateLeadCaches(leadId);
  return finalDraft;
}

export async function runWriterSequence(
  leadId: string,
  options?: { outreachTemplate?: string; writerMode?: WriterMode; occasionTheme?: string | null },
): Promise<WriterDraft[]> {
  const data = await post<{ drafts: WriterDraft[]; draft: WriterDraft }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    writerMode: options?.writerMode,
    occasionTheme: options?.occasionTheme,
    mode: "sequence",
  });
  invalidateLeadCaches(leadId);
  return data.drafts ?? [data.draft];
}

export async function regenerateSequenceStep(
  leadId: string,
  sequencePosition: 2 | 3,
  options?: { outreachTemplate?: string; writerMode?: WriterMode; occasionTheme?: string | null },
): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    writerMode: options?.writerMode,
    occasionTheme: options?.occasionTheme,
    mode: "single",
    sequencePosition,
  });
  return data.draft;
}

export type EmailOverviewData = {
  outreachPaused?: boolean;
  sendMode?: string;
  cadenceDays: [number, number];
  stats: {
    totalSent: number;
    opened: number;
    replied: number;
    dueToday: number;
    total: number;
    needsReview: number;
    replies: number;
    tabCounts?: {
      needs_review: number;
      active: number;
      hot: number;
      replies: number;
      done: number;
    };
  };
  needsReview: import("@/app/api/email/overview/route").LeadEmailRow[];
  replies: import("@/app/api/email/overview/route").LeadEmailRow[];
  hot: import("@/app/api/email/overview/route").LeadEmailRow[];
  active: import("@/app/api/email/overview/route").LeadEmailRow[];
  done: import("@/app/api/email/overview/route").LeadEmailRow[];
  draftReady: import("@/app/api/email/overview/route").LeadEmailRow[];
  stopped: import("@/app/api/email/overview/route").LeadEmailRow[];
};

export async function fetchOutreachSendingStatus(): Promise<{ outreachPaused: boolean }> {
  const res = await fetch("/api/settings/email/sending");
  if (!res.ok) throw new Error("Failed to load sending status");
  return res.json();
}

export type SequenceControlState = "not_started" | "active" | "paused" | "cancelled" | "complete";

export async function controlLeadSequence(
  leadId: string,
  action: "start" | "pause" | "cancel" | "reset",
): Promise<{ state: SequenceControlState; updated: number }> {
  const data = await post<{ ok: boolean; state: SequenceControlState; updated: number }>(
    "/api/outreach/sequence",
    { leadId, action },
  );
  return { state: data.state, updated: data.updated };
}

export async function setOutreachSendingPaused(paused: boolean): Promise<{ outreachPaused: boolean }> {
  const data = await post<{ ok: boolean; outreachPaused: boolean }>("/api/settings/email/sending", { paused });
  return { outreachPaused: data.outreachPaused };
}

export type EmailOverviewTab = "needs_review" | "active" | "hot" | "replies" | "done";

export async function fetchEmailOverview(tabs?: EmailOverviewTab | EmailOverviewTab[]): Promise<EmailOverviewData> {
  const params = new URLSearchParams();
  if (tabs) {
    const list = Array.isArray(tabs) ? tabs : [tabs];
    params.set("tabs", list.join(","));
  } else {
    params.set("tabs", "all");
  }
  const res = await fetch(`/api/email/overview?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load outreach queue");
  return res.json();
}

export type EmailLogStatus = "opened" | "delivered" | "bounced";

export type EmailLogRow = {
  id: string;
  leadId: string;
  to: string;
  contactName: string;
  companyName: string;
  subject: string;
  sequenceDay: number;
  sentAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  status: EmailLogStatus;
};

export type EmailLogsData = {
  items: EmailLogRow[];
  total: number;
  limit: number;
  offset: number;
  counts: {
    all: number;
    opened: number;
    bounced: number;
    delivered: number;
  };
};

export async function fetchEmailLogs(params?: {
  status?: "all" | EmailLogStatus;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<EmailLogsData> {
  const search = new URLSearchParams();
  if (params?.status && params.status !== "all") search.set("status", params.status);
  if (params?.q?.trim()) search.set("q", params.q.trim());
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`/api/email/logs${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to load send logs");
  return res.json();
}

export async function runWhatsAppWriter(leadId: string): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/whatsapp", { leadId });
  return data.draft;
}

export async function openWhatsAppOutreach(leadOutreachId: string): Promise<{ url: string; to: string }> {
  return post<{ url: string; to: string }>("/api/outreach/whatsapp/open", { leadOutreachId });
}

export async function runReplyWriter(leadId: string): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/reply", { leadId });
  return data.draft;
}


export async function reviseDraft(
  leadOutreachId: string,
  message: string,
): Promise<{ draft: WriterDraft; messages: EditMessage[] }> {
  return post<{ draft: WriterDraft; messages: EditMessage[] }>("/api/agents/writer/revise", {
    leadOutreachId,
    message,
  });
}


export async function createBlankOutreachSequence(params: {
  leadId: string;
  outreachTemplate?: string;
}): Promise<{ drafts: WriterDraft[]; draft: WriterDraft }> {
  const res = await fetch("/api/outreach/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to start blank drafts");
  }
  invalidateLeadCaches(params.leadId);
  return res.json();
}

export async function ensureCatalogOnOpenDraftClient(params: {
  leadId: string;
}): Promise<{ draft: WriterDraft; drafts: WriterDraft[] }> {
  const res = await fetch("/api/outreach/catalog-on-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to load If Opened draft");
  }
  return res.json();
}

export async function ensureBlankReplyDraftClient(params: {
  leadId: string;
}): Promise<{ draft: WriterDraft; drafts: WriterDraft[] }> {
  const res = await fetch("/api/outreach/blank-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to open blank reply");
  }
  return res.json();
}

export async function updateOutreachDraft(params: {
  leadOutreachId: string;
  emailBody?: string;
  emailBodyB?: string;
  emailBodyC?: string;
  subjectA?: string;
  subjectB?: string;
  subjectC?: string;
  chosenSubjectKey?: string;
  chosenBodyKey?: string;
  whatsapp?: string;
}): Promise<{
  id: string;
  subjectA?: string;
  subjectB?: string;
  subjectC?: string;
  emailBody?: string;
  emailBodyB?: string;
  emailBodyC?: string;
  chosenSubjectKey?: string;
  chosenBodyKey?: string;
  whatsapp?: string | null;
}> {
  const res = await fetch("/api/outreach/draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to save draft");
  }
  return res.json();
}

export async function approveOutreach(params: {
  leadOutreachId: string;
  leadId: string;
  channel: string;
  status: "approved" | "rejected";
  subjectUsed?: string;
  bodyUsed?: string;
  rejectReason?: string;
  rejectNote?: string;
}): Promise<{ approvalId: string }> {
  return post<{ approvalId: string }>("/api/outreach/approve", params);
}

export async function sendOutreach(
  approvalId: string,
  options?: {
    overridePreflight?: boolean;
    overrideQualityGate?: boolean;
    toEmails?: string[];
  },
): Promise<{ mode: string; messageId?: string; to?: string; recipients?: string[] }> {
  return post<{ mode: string; messageId?: string; to?: string; recipients?: string[] }>("/api/outreach/send", {
    approvalId,
    overridePreflight: options?.overridePreflight,
    overrideQualityGate: options?.overrideQualityGate,
    toEmails: options?.toEmails,
  });
}



export type LeadFormInput = {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  company: string;
  city?: string;
  industry?: string;
  employees?: string;
  score?: number;
  rating?: string;
  owner?: string;
  tags?: string[];
  estimatedValue?: string;
};

export async function createLead(input: LeadFormInput): Promise<{ id: string; existing?: boolean }> {
  const data = await post<{ ok: boolean; id: string; existing?: boolean }>("/api/leads", input);
  invalidateLeadCaches();
  return { id: data.id, existing: data.existing };
}

export type LinkedInLeadPartialProfile = {
  name: string;
  title?: string;
  company?: string;
  city?: string;
  email?: string;
  phone?: string;
  linkedIn: string;
  bio?: string;
};

export class LinkedInLeadIncompleteError extends Error {
  code = "LINKEDIN_PROFILE_INCOMPLETE" as const;
  partial: LinkedInLeadPartialProfile;

  constructor(message: string, partial: LinkedInLeadPartialProfile) {
    super(message);
    this.name = "LinkedInLeadIncompleteError";
    this.partial = partial;
  }
}

export type CreateLeadFromLinkedInResult = {
  id: string;
  existing?: boolean;
  enriched?: boolean;
  profile: LinkedInLeadPartialProfile & { company: string };
};

export async function createLeadFromLinkedIn(input: {
  linkedInUrl: string;
  enrich?: boolean;
  score?: number;
}): Promise<CreateLeadFromLinkedInResult> {
  const res = await fetch("/api/leads/from-linkedin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({ error: res.statusText }))) as Record<string, unknown>;
  if (!res.ok) {
    if (body.code === "LINKEDIN_PROFILE_INCOMPLETE" && body.partial) {
      throw new LinkedInLeadIncompleteError(
        typeof body.error === "string" ? body.error : "Profile incomplete",
        body.partial as LinkedInLeadPartialProfile,
      );
    }
    throwFromErrorBody(body, res.statusText);
  }
  return {
    id: String(body.id),
    existing: body.existing === true,
    enriched: body.enriched === true,
    profile: body.profile as CreateLeadFromLinkedInResult["profile"],
  };
}

export type LeadImportTargetField =
  | "name"
  | "firstName"
  | "lastName"
  | "company"
  | "title"
  | "email"
  | "phone"
  | "linkedIn"
  | "city"
  | "industry"
  | "employees"
  | "score"
  | "tags"
  | "rating"
  | "owner";

export type LeadImportColumnMapping = Record<string, LeadImportTargetField | null>;

export type LeadImportPreviewResult = {
  ok: boolean;
  filename: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  rows: Record<string, string>[];
  mapping: LeadImportColumnMapping;
  confidence: number;
  mappingSource: "llm" | "heuristic";
  notes?: string;
  warnings: string[];
  requiredOk: boolean;
  missingRequired: string[];
  loadCount?: number;
  skipCount?: number;
  failCount?: number;
};

export type LeadImportRowResult = {
  rowIndex: number;
  name: string;
  company: string;
  status: "created" | "skipped" | "failed";
  leadId?: string;
  enriched?: boolean;
  error?: string;
};

export type LeadImportConfirmResult = {
  ok: boolean;
  created: number;
  skipped: number;
  failed: number;
  enriched: number;
  results: LeadImportRowResult[];
  errors: string[];
  warnings?: string[];
};

export async function previewLeadImport(file: File): Promise<LeadImportPreviewResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/leads/import/preview", { method: "POST", body: form });
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as LeadImportPreviewResult;
}

export async function confirmLeadImport(input: {
  rows: Record<string, string>[];
  mapping: LeadImportColumnMapping;
  enrich?: boolean;
}): Promise<LeadImportConfirmResult> {
  return post<LeadImportConfirmResult>("/api/leads/import/confirm", input);
}

export type MergeLeadDuplicatesResult = {
  merged: number;
  groups: { keepId: string; deletedIds: string[] }[];
};

export async function mergeLeadDuplicates(input?: {
  keepId?: string;
  dropIds?: string[];
}): Promise<MergeLeadDuplicatesResult> {
  return post<MergeLeadDuplicatesResult>("/api/leads/duplicates", input ?? {});
}

export async function updateLead(leadId: string, input: Partial<LeadFormInput>): Promise<void> {
  await patch(`/api/leads/${leadId}`, input);
  invalidateLeadCaches(leadId);
}

export async function deleteLead(leadId: string): Promise<void> {
  const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  invalidateLeadCaches(leadId);
}

export async function updateLeadStatus(
  leadId: string,
  params: { status: "tasting_sent" | "negotiate" | "closed"; closedDealAmount?: string },
): Promise<void> {
  await patch(`/api/leads/${leadId}`, params);
  invalidateLeadCaches(leadId);
}

export type InboxReplySyncResult = {
  processed: number;
  matched: number;
  checked: number;
  skipped: number;
  errors: string[];
  provider?: "smtp" | "resend";
};

export async function syncInboxReplies(): Promise<InboxReplySyncResult> {
  const data = await post<{
    ok: boolean;
    processed?: number;
    matched?: number;
    checked?: number;
    skipped?: number;
    errors?: string[];
    provider?: "smtp" | "resend";
  }>("/api/replies/poll", {});
  return {
    processed: data.processed ?? 0,
    matched: data.matched ?? 0,
    checked: data.checked ?? 0,
    skipped: data.skipped ?? 0,
    errors: data.errors ?? [],
    provider: data.provider,
  };
}

export async function markReplied(leadId: string): Promise<void> {
  await post("/api/webhooks/reply", { leadId, source: "manual" });
}

// ─── Shared types (UI-facing) ─────────────────────────────────────────────────
export type LeadQueueItem = {
  id: string;
  name: string;
  title: string;
  company: string;
  companyDomain?: string;
  employees?: string;
  domain?: string;
  website?: string;
  city: string;
  score: number;
  status: string;
  action: string;
  emailStatus: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  leadSource?: string;
  isPinned?: boolean;
  createdByUserId?: string;
  createdByName?: string;
  nextActionDate?: string;
  createdAt?: string;
};

export type LeadAddedByUser = {
  id: string;
  name: string;
  email: string;
};

export async function fetchLeadAddedByUsers(): Promise<LeadAddedByUser[]> {
  const data = await get<{ users: LeadAddedByUser[] }>("/api/leads/added-by-users");
  return data.users;
}

export type EmailTestStatus = "saved" | "sent" | "rejected";

export type ContactEmailEntry = {
  email: string;
  emailStatus: string;
  emailConfidence?: number;
  enrichmentSource?: string;
  enrichmentProvider?: string;
  testStatus?: EmailTestStatus;
  pattern?: string;
};

export type LeadDetailRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  domain?: string;
  website?: string;
  city: string;
  employees: string;
  email: string;
  emails: ContactEmailEntry[];
  emailStatus: string;
  emailConfidence?: number;
  enrichmentSource?: string;
  enrichmentProvider?: string;
  phone?: string;
  linkedIn?: string;
  score: number;
  scoreGrade: string;
  scoreTrend: string;
  estimatedValue?: string;
  closedDealAmount?: string;
  status: string;
  leadSource: string;
  rating: string;
  owner: string;
  tags: string[];
  research?: {
    confidenceTier: string;
    outreachHook?: string;
    estimatedOrderValue?: string;
    scoreFactors: { label: string; bold: string }[];
  };
  outreach?: WriterDraft;
  outreachSequence?: WriterDraft[];
  whatsappDraft?: WriterDraft;
  whatsappConnected?: boolean;
  emailThread?: EmailThread;
  upNext: UpNextItem[];
  network: {
    name: string;
    email?: string;
    linkedIn?: string;
    strength: 1 | 2 | 3 | 4;
    degree?: "1st" | "2nd" | "3rd";
    headline?: string;
    relationship: string;
    connectorName: string;
    path: string[];
  }[];
  giftingIntelligence?: string;
  companyOverview?: CompanyOverview;
  accountId?: string;
  industry?: string;
  fitScore?: number;
  budgetBand?: string;
  isPinned?: boolean;
  createdByUserId?: string;
  createdByName?: string;
  outreachTemplates?: { id: string; label: string; shortLabel: string; description: string }[];
  defaultOutreachCta?: string;
};

export type EditMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type WriterDraft = {
  id: string;
  subjectA?: string;
  subjectB?: string;
  subjectC?: string;
  emailBody?: string;
  emailBodyB?: string;
  emailBodyC?: string;
  chosenSubjectKey?: string;
  chosenBodyKey?: string;
  deliverabilityScore?: number;
  deliverabilityVerdict?: string;
  inboxScore?: number;
  spamFactors?: { label: string; delta: number }[];
  rubricScore?: Record<string, number>;
  rubricTotal?: number;
  draftSource: string;
  promptVersion?: string;
  revisionCount?: number;
  revisionTimeout?: boolean;
  templateVariant?: string;
  outreachGoal?: string;
  confidenceTier?: string;
  approvalStatus: string;
  replySent?: boolean;
    sequencePosition?: number;
    editMessages?: EditMessage[];
    whatsapp?: string;
};


export type ThreadPhase =
  | "compose"
  | "outreached"
  | "awaiting_reply"
  | "they_replied"
  | "drafting_reply"
  | "reply_sent"
  | "complete";

export type BarMode = "hidden" | "drafts" | "sequence" | "reply";

export type BarNodeState = "done" | "current" | "upcoming" | "scheduled" | "paused" | "skipped";

export type BarNodeKind = "draft" | "sent" | "scheduled" | "inbound" | "reply_draft";

export type BarNode = {
  id: string;
  label: string;
  state: BarNodeState;
  kind: BarNodeKind;
  outreachId?: string;
  scheduleId?: string;
  daysUntil?: number;
  subject?: string;
  body?: string;
  snippet?: string;
  at?: string;
  openedAt?: string;
  bouncedAt?: string;
  bounceType?: string;
  bounceReason?: string;
  recipientEmail?: string;
  action?: "draft_reply";
};

export type ThreadEvent = {
  id: string;
  kind: "initial" | "followup" | "inbound_reply" | "outbound_reply" | "scheduled" | "draft";
  label: string;
  subject?: string;
  snippet?: string;
  body?: string;
  at?: string;
  status: "sent" | "scheduled" | "cancelled" | "draft" | "opened" | "bounced";
  openedAt?: string;
  bouncedAt?: string;
  bounceType?: string;
  bounceReason?: string;
  recipientEmail?: string;
  sequenceDay?: number;
};

export type EmailThread = {
  threadRootSubject?: string;
  sequenceState?: SequenceControlState;
  phase: ThreadPhase;
  nextAction: "send_reply" | "await_reply" | "followup_due" | "compose" | "complete";
  nextStep?: { title: string; description: string; primaryAction?: string };
  barMode: BarMode;
  barNodes: BarNode[];
  cadenceDays?: [number, number];
  selectedNodeId?: string;
  events: ThreadEvent[];
  inboundSnippet?: string;
  showComposeZone: boolean;
};

export type UpNextItem = {
  title: string;
  step: string;
  desc: string;
  icon: "package" | "phone" | "file" | "mail";
  active: boolean;
  primaryAction?: string;
};
export async function enrichLead(
  leadId: string,
  options: { mode: "free" | "paid"; refetch?: boolean } = { mode: "free" },
): Promise<{
  success: boolean;
  enrichment: {
    email: string | null;
    phone: string | null;
    emailStatus: string;
    emailConfidence: number;
    confidenceTier: string;
    enrichmentSource?: string;
    enrichmentProvider?: string;
    title?: string | null;
    message?: string;
    alternateEmails?: ContactEmailEntry[];
  };
}> {
  return post("/api/leads/" + leadId + "/enrich", { mode: options.mode, refetch: options.refetch });
}

export type EmailPermutation = {
  email: string;
  pattern: string;
  localPart: string;
};

export type EmailSuggestResponse = {
  domain: string;
  firstName: string;
  lastName: string;
  suggestions: EmailPermutation[];
};

export async function suggestLeadEmails(leadId: string): Promise<EmailSuggestResponse> {
  return get<EmailSuggestResponse>(`/api/leads/${leadId}/emails/suggest`);
}

export async function saveLeadEmails(
  leadId: string,
  payload: {
    emails: string[];
    primaryEmail?: string;
    allowEmpty?: boolean;
    clear?: boolean;
    domain?: string;
  },
): Promise<{
  success: boolean;
  email: string | null;
  emailStatus: string;
  alternateEmails: ContactEmailEntry[];
}> {
  return post(`/api/leads/${leadId}/emails/save`, payload);
}



// ─── Scout Directory ──────────────────────────────────────────────────────────
export type DirectoryContact = {
  leadId: string;
  contactId: string;
  name: string;
  title: string;
  email: string;
  emailStatus: string;
  phone?: string;
  linkedIn?: string;
  status: string;
  leadSource: string;
  score: number;
  savedAt: string;
  isKeyDM?: boolean;
  companyId: string;
  companyName: string;
  companyCity: string;
  companyIndustry: string;
};

export type DirectoryCompany = {
  id: string;
  name: string;
  city: string;
  industry: string;
  employees: string;
  fitScore: number;
  domain?: string;
  website?: string;
  companyOverview?: CompanyOverview;
  overviewEnrichedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  contacts: Omit<DirectoryContact, "companyId" | "companyName" | "companyCity" | "companyIndustry">[];
};

export type DirectoryResponse = {
  companies: DirectoryCompany[];
  contacts: DirectoryContact[];
  nextCursor?: string | null;
  totals: { companies: number; contacts: number };
};

export type FetchDirectoryParams = {
  limit?: number;
  cursor?: string | null;
  totals?: boolean;
};

export async function fetchDirectory(params?: FetchDirectoryParams): Promise<DirectoryResponse> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 50));
  if (params?.cursor) qs.set("cursor", params.cursor);
  if (params?.totals === false) qs.set("totals", "0");
  const path = `/api/directory?${qs.toString()}`;
  if (params?.cursor) return get<DirectoryResponse>(path);
  return cachedFetch(path, () => get<DirectoryResponse>(path));
}

export type DirectoryContactsResponse = {
  contacts: DirectoryContact[];
  nextCursor: string | null;
};

export async function fetchDirectoryContacts(params?: {
  companyId?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<DirectoryContactsResponse> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 50));
  if (params?.companyId) qs.set("companyId", params.companyId);
  if (params?.cursor) qs.set("cursor", params.cursor);
  const data = await get<{ contacts: DirectoryContact[]; nextCursor?: string | null }>(
    `/api/directory/contacts?${qs.toString()}`,
  );
  return { contacts: data.contacts, nextCursor: data.nextCursor ?? null };
}

// ─── Pins ─────────────────────────────────────────────────────────────────────
export type PinnedLead = {
  id: string;
  type: "lead";
  name: string;
  title: string;
  company: string;
  domain?: string;
  website?: string;
  city: string;
  score: number;
  status: string;
  email: string;
  emailStatus: string;
  isPinned: boolean;
  updatedAt: string;
};

export type PinnedCompany = {
  id: string;
  type: "company";
  name: string;
  industry: string;
  city: string;
  employees: string;
  fitScore: number;
  isPinned: boolean;
  updatedAt: string;
};

export type PinsResponse = {
  leads: PinnedLead[];
  companies: PinnedCompany[];
};

export async function fetchPins(): Promise<PinsResponse> {
  return get<PinsResponse>("/api/pins");
}

export async function togglePin(type: "lead" | "company", id: string, pinned: boolean): Promise<void> {
  await post("/api/pins", { type, id, pinned });
}

// ─── Contacts List ────────────────────────────────────────────────────────────
export type ContactListItem = {
  id: string;
  leadId: string | null;
  name: string;
  title: string;
  email: string;
  emailStatus: string;
  phone: string | null;
  linkedIn: string | null;
  company: string;
  companyId: string;
  city: string;
  industry: string;
  isKeyDM: boolean;
  hasLead: boolean;
  score: number | null;
  status: string | null;
};


export async function createLeadFromContact(contact: {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  company: string;
  city?: string;
  industry?: string;
  score?: number | null;
}): Promise<{ id: string }> {
  const res = await post<{ ok: boolean; id: string }>("/api/leads", {
    name: contact.name,
    title: contact.title !== "—" ? contact.title : undefined,
    email: contact.email !== "—" ? contact.email : undefined,
    phone: contact.phone,
    company: contact.company,
    city: contact.city,
    industry: contact.industry,
    score: contact.score ?? undefined,
  });
  return { id: res.id };
}

export async function scoutExactSearch(params: {
  query: string;
  personName?: string;
  city?: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  const { signal, ...body } = params;
  return post("/api/scout/exact", body, signal);
}

export async function submitDraftFeedback(outreachId: string, rating: "up" | "down", comment?: string): Promise<void> {
  await post("/api/outreach/feedback", { outreachId, rating, comment });
}

export type FetchContactsPage = {
  contacts: ContactListItem[];
  nextCursor: string | null;
};

export async function fetchContactsPage(params?: {
  limit?: number;
  cursor?: string | null;
}): Promise<FetchContactsPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params?.limit ?? 50));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const path = `/api/contacts?${qs.toString()}`;
  const data = params?.cursor
    ? await get<{ contacts?: ContactListItem[]; nextCursor?: string | null } | ContactListItem[]>(path)
    : await cachedFetch(path, () =>
        get<{ contacts?: ContactListItem[]; nextCursor?: string | null } | ContactListItem[]>(path),
      );
  // Backward compat: older servers returned a bare array
  if (Array.isArray(data)) {
    return { contacts: data, nextCursor: null };
  }
  return { contacts: data.contacts ?? [], nextCursor: data.nextCursor ?? null };
}

/** First page of contacts (default limit 50). Prefer `fetchContactsPage` for load-more. */
export async function fetchContacts(params?: {
  limit?: number;
  cursor?: string | null;
}): Promise<ContactListItem[]> {
  const page = await fetchContactsPage(params);
  return page.contacts;
}

export type NetworkGraph = import("./network/types").NetworkGraph;

export async function fetchLeadNetworkSummary(
  id: string,
): Promise<LeadDetailRecord["network"]> {
  const data = await get<{ network: LeadDetailRecord["network"] }>(`/api/leads/${id}/network/summary`);
  return data.network ?? [];
}

export async function fetchLeadNetwork(id: string): Promise<NetworkGraph> {
  const data = await get<{ graph: NetworkGraph }>(`/api/leads/${id}/network`);
  return data.graph;
}


export type SenderHealthResponse = {
  issues: { id: string; label: string; severity: string }[];
  sendsLast24h: number;
  dailyCap: number;
  remainingToday?: number;
  recommendedDailyCap?: number;
  warmupStage?: string;
  projectedAdditional?: number;
  bounceStats?: {
    sent: number;
    bounced: number;
    rate: number;
    windowHours: number;
    threshold: number;
    minSent: number;
    exceedsThreshold: boolean;
  };
  personalInboxSender: boolean;
  canSendLive: boolean;
  hasCritical: boolean;
  domainAuth: {
    domain: string;
    status: "pass" | "partial" | "fail" | "unsupported";
    label: string;
    passCount: number;
    checks: {
      spf: { found: boolean; valid: boolean; warning?: string | null };
      dmarc: { found: boolean; valid: boolean; policy?: string | null; warning?: string | null };
      dkim: { found: boolean; valid: boolean; selector?: string; note?: string };
    };
  };
};

export async function fetchSenderHealth(): Promise<SenderHealthResponse> {
  const res = await fetch("/api/email/sender-health");
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load sender health");
  return res.json();
}

// ─── Brand Intelligence (Gift Intel) ────────────────────────────────────────
export type {
  ExtractedGiftIntel,
  GiftIntelResultRow,
  GiftIntelSweepResult,
  SourceTier,
} from "./brand-intel/types";

import type {
  ExtractedGiftIntel,
  GiftIntelSweepResult,
  SourceTier,
} from "./brand-intel/types";

export type GiftIntelConfigView = {
  productCategory: string;
  competitorBrands: string[];
  locations?: Array<{
    id: string;
    label: string;
    group: string;
    kind: "india" | "region" | "state" | "district" | "area";
    searchTerms: string[];
  }>;
  locationSummary?: string;
};

export async function fetchGiftIntelConfig(): Promise<GiftIntelConfigView> {
  return get<GiftIntelConfigView>("/api/settings/brand-intel");
}

export async function fetchScoutLocations(): Promise<{
  locations: NonNullable<GiftIntelConfigView["locations"]>;
  scoutGeo?: {
    entireIndia: boolean;
    regionIds: string[];
    stateIds: string[];
    districtIds: string[];
  };
}> {
  return get("/api/scout/locations");
}

export async function runGiftIntelSweep(params: {
  competitorBrands?: string[];
  cities?: string[];
  enabledSourceTiers?: SourceTier[];
  sweepMode?: "competitors" | "occasions" | "upcoming_openings";
}): Promise<GiftIntelSweepResult> {
  return post<GiftIntelSweepResult>("/api/agents/brand-intel/run", params);
}

export async function confirmGiftIntelMerge(params: {
  accountId?: string;
  extraction: ExtractedGiftIntel;
}): Promise<{ ok: boolean; accountId: string; created?: boolean; name?: string }> {
  return post<{ ok: boolean; accountId: string; created?: boolean; name?: string }>(
    "/api/agents/brand-intel/confirm",
    params,
  );
}


export async function sendFollowUp(
  scheduleId: string,
  options?: { overridePreflight?: boolean; overrideQualityGate?: boolean },
): Promise<{ messageId: string; mode: string; outreachId: string; whatsappOpen?: { url: string; to: string } }> {
  return post<{ messageId: string; mode: string; outreachId: string; whatsappOpen?: { url: string; to: string } }>("/api/outreach/send-followup", {
    scheduleId,
    overridePreflight: options?.overridePreflight,
    overrideQualityGate: options?.overrideQualityGate,
  });
}


