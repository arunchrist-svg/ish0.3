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
  options?: { outreachTemplate?: string },
): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/run", {
    leadId,
    outreachTemplate: options?.outreachTemplate,
  });
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
}): Promise<void> {
  await post("/api/outreach/approve", params);
}

export async function sendOutreach(approvalId: string): Promise<{ mode: string; messageId?: string }> {
  return post("/api/outreach/send", { approvalId });
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
  editMessages?: EditMessage[];
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
  options: { mode: "free" | "paid" } = { mode: "free" },
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
  };
}> {
  return post("/api/leads/" + leadId + "/enrich", { mode: options.mode });
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
