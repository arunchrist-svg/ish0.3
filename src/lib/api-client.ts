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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

// ─── Scout ────────────────────────────────────────────────────────────────────
export async function scoutCompanies(params: {
  cities: string[];
  industries: string[];
  dataMode: DataMode;
}): Promise<ScoutCompanyResult[]> {
  const data = await post<{ companies: ScoutCompanyResult[] }>("/api/scout/companies", params);
  return data.companies;
}

export async function scoutPeople(params: {
  companyName: string;
  companyDomain?: string;
  dataMode: DataMode;
}): Promise<ScoutPersonResult[]> {
  const data = await post<{ people: ScoutPersonResult[] }>("/api/scout/people", params);
  return data.people;
}

export async function scoutSave(params: {
  people: ScoutPersonResult[];
  company: ScoutCompanyResult;
}): Promise<{ saved: { leadId: string; name: string; emailStatus: string }[]; skipped: { name: string; reason: string }[] }> {
  return post("/api/scout/save", params);
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

export async function runWriter(leadId: string): Promise<WriterDraft> {
  const data = await post<{ draft: WriterDraft }>("/api/agents/writer/run", { leadId });
  return data.draft;
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
  phone?: string;
  linkedIn?: string;
  score: number;
  scoreGrade: string;
  scoreTrend: string;
  estimatedValue?: string;
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
  network: { name: string; email: string }[];
  giftingIntelligence?: string;
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
};

export type UpNextItem = {
  title: string;
  step: string;
  desc: string;
  icon: "package" | "phone" | "file" | "mail";
  active: boolean;
  primaryAction?: string;
};
