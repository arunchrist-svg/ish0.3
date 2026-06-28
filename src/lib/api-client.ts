import type { CompanyOverview, CompanyOverviewInput, CompanyOverviewResult } from "./company-overview";
import type { ScoutCompanyResult, ScoutPersonResult, DataMode } from "./enrichment/types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
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
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
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
  excludeNames?: string[];
  skipInternal?: boolean;
  fetchSeed?: number;
  limit?: number;
  companyName?: string;
}): Promise<ScoutCompaniesResponse> {
  return post<ScoutCompaniesResponse>("/api/scout/companies", params);
}

export type ScoutPeopleResponse = {
  people: ScoutPersonResult[];
  warnings?: string[];
  errors?: string[];
};

export async function scoutPeople(params: {
  companyName: string;
  companyDomain?: string;
  companyWebsite?: string;
  dataMode: DataMode;
  limit?: number;
  seniority?: string[];
  departments?: string[];
}): Promise<ScoutPeopleResponse> {
  return post<ScoutPeopleResponse>("/api/scout/people", params);
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
  },
  onResult: (companyId: string, result: ScoutPeopleResponse) => void,
): Promise<void> {
  const res = await fetch("/api/scout/people/batch?stream=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
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
export async function fetchLeads(params?: { status?: string }): Promise<LeadQueueItem[]> {
  const qs = params?.status ? `?status=${params.status}` : "";
  const data = await get<{ leads: LeadQueueItem[] }>(`/api/leads${qs}`);
  return data.leads;
}

export async function fetchLead(id: string): Promise<LeadDetailRecord> {
  const data = await get<{ lead: LeadDetailRecord }>(`/api/leads/${id}`);
  return data.lead;
}

export async function runWriter(
  leadId: string,
  options?: { outreachTemplate?: string; mode?: "sequence" | "single" },
): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft; drafts?: WriterDraft[] }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    mode: options?.mode ?? "sequence",
  });
  return data.draft;
}

export async function runWriterSequence(
  leadId: string,
  options?: { outreachTemplate?: string },
): Promise<WriterDraft[]> {
  const data = await post<{ drafts: WriterDraft[]; draft: WriterDraft }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    mode: "sequence",
  });
  return data.drafts ?? [data.draft];
}

export async function regenerateSequenceStep(
  leadId: string,
  sequencePosition: 2 | 3,
  options?: { outreachTemplate?: string },
): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
    mode: "single",
    sequencePosition,
  });
  return data.draft;
}

export type EmailOverviewData = {
  cadenceDays: [number, number];
  stats: {
    totalSent: number;
    opened: number;
    replied: number;
    dueToday: number;
    total: number;
    needsReview: number;
    replies: number;
  };
  needsReview: import("@/app/api/email/overview/route").LeadEmailRow[];
  replies: import("@/app/api/email/overview/route").LeadEmailRow[];
  hot: import("@/app/api/email/overview/route").LeadEmailRow[];
  active: import("@/app/api/email/overview/route").LeadEmailRow[];
  done: import("@/app/api/email/overview/route").LeadEmailRow[];
  draftReady: import("@/app/api/email/overview/route").LeadEmailRow[];
  stopped: import("@/app/api/email/overview/route").LeadEmailRow[];
};

export async function fetchEmailOverview(): Promise<EmailOverviewData> {
  const res = await fetch("/api/email/overview");
  if (!res.ok) throw new Error("Failed to load outreach queue");
  return res.json();
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


export async function updateOutreachDraft(params: {
  leadOutreachId: string;
  emailBody?: string;
  subjectA?: string;
  subjectB?: string;
}): Promise<{ id: string; subjectA?: string; subjectB?: string; emailBody?: string }> {
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
  rejectReason?: string;
  rejectNote?: string;
}): Promise<{ approvalId: string }> {
  return post<{ approvalId: string }>("/api/outreach/approve", params);
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

export async function sendOutreach(
  approvalId: string,
  options?: { overridePreflight?: boolean },
): Promise<{ mode: string; messageId?: string; to?: string }> {
  const res = await fetch("/api/outreach/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, overridePreflight: options?.overridePreflight }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "SENDER_PREFLIGHT_FAILED") {
      throw new SenderPreflightApiError(
        data.error ?? "Sender preflight failed",
        data.issues ?? [],
        data.canOverride ?? true,
      );
    }
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}


export async function updateLeadStatus(
  leadId: string,
  params: { status: "tasting_sent" | "negotiate" | "closed"; closedDealAmount?: string },
): Promise<void> {
  await patch(`/api/leads/${leadId}`, params);
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
  city: string;
  score: number;
  status: string;
  action: string;
  emailStatus: string;
  nextActionDate?: string;
};

export type ContactEmailEntry = {
  email: string;
  emailStatus: string;
  emailConfidence?: number;
  enrichmentSource?: string;
  enrichmentProvider?: string;
};

export type LeadDetailRecord = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
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
    giftingHook?: string;
    estimatedOrderValue?: string;
    scoreFactors: { label: string; bold: string }[];
  };
  outreach?: WriterDraft;
  outreachSequence?: WriterDraft[];
  emailThread?: EmailThread;
  upNext: UpNextItem[];
  network: {
    name: string;
    email?: string;
    linkedIn?: string;
    strength: 1 | 2 | 3 | 4;
    relationship: string;
    connectorName: string;
    path: string[];
  }[];
  giftingIntelligence?: string;
  companyOverview?: CompanyOverview;
  accountId?: string;
  industry?: string;
  giftScore?: number;
  giftBudget?: string;
  isPinned?: boolean;
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
  emailBody?: string;
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

export type BarNodeState = "done" | "current" | "upcoming" | "scheduled";

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
  status: "sent" | "scheduled" | "cancelled" | "draft";
  sequenceDay?: number;
};

export type EmailThread = {
  threadRootSubject?: string;
  phase: ThreadPhase;
  nextAction: "send_reply" | "await_reply" | "followup_due" | "compose" | "complete";
  nextStep: { title: string; description: string; primaryAction?: string };
  barMode: BarMode;
  barNodes: BarNode[];
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
  giftScore: number;
  domain?: string;
  website?: string;
  companyOverview?: CompanyOverview;
  overviewEnrichedAt?: string;
  contacts: Omit<DirectoryContact, "companyId" | "companyName" | "companyCity" | "companyIndustry">[];
};

export type DirectoryResponse = {
  companies: DirectoryCompany[];
  contacts: DirectoryContact[];
  totals: { companies: number; contacts: number };
};

export async function fetchDirectory(): Promise<DirectoryResponse> {
  return get<DirectoryResponse>("/api/directory");
}

// ─── Pins ─────────────────────────────────────────────────────────────────────
export type PinnedLead = {
  id: string;
  type: "lead";
  name: string;
  title: string;
  company: string;
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
  giftScore: number;
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

export async function fetchContacts(): Promise<ContactListItem[]> {
  return get<ContactListItem[]>("/api/contacts");
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
  personalInboxSender: boolean;
  canSendLive: boolean;
  hasCritical: boolean;
  domainAuth: {
    domain: string;
    status: "pass" | "partial" | "fail" | "unsupported";
    label: string;
    passCount: number;
    checks: {
      spf: { found: boolean; valid: boolean };
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
