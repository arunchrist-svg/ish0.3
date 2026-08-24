import type { LeadQueueItem } from "@/lib/api-client";
import { isGenericCompanyEmail, sanitizePhone } from "@/lib/enrichment/validate-contact";
import { isPersonalInboxDomain } from "@/lib/email/sender-domain";
import {
  isContactReadyStage,
  isPastReplyStage,
  statusToPipelineIndex,
} from "@/lib/pipeline-status";

export const LEAD_QUICK_FILTER_STORAGE_KEY = "ish-leads-quick-filter";
export const LEAD_PANEL_FILTERS_STORAGE_KEY = "ish-leads-panel-filters";
export const LEAD_QUEUE_SORT_STORAGE_KEY = "ish-leads-queue-sort";
export const LEAD_ADDED_BY_STORAGE_KEY = "ish-leads-added-by-user";

export type LeadEmailKind = "business" | "personal" | "generic" | "missing";

export type LeadQuickFilterId =
  | "ready_to_write"
  | "ready_to_send"
  | "awaiting_reply"
  | "replied"
  | "has_mobile"
  | "needs_email";

export type LeadPanelFilterId =
  | "business_email"
  | "personal_email"
  | "generic_inbox"
  | "no_email"
  | "verified_email"
  | "unverified_email"
  | "has_mobile"
  | "has_linkedin"
  | "email_sent"
  | "not_sent"
  | "draft_ready"
  | "contact_ready"
  | "high_score"
  | "pinned"
  | "excel_import";

export type LeadQueueSort = "score" | "date_newest" | "date_oldest";

export type LeadAddedByUserOption = {
  id: string;
  name: string;
};

export const EMAIL_TYPE_FILTERS: LeadPanelFilterId[] = [
  "business_email",
  "personal_email",
  "generic_inbox",
  "no_email",
];

const EMAIL_STATUS_FILTERS: LeadPanelFilterId[] = ["verified_email", "unverified_email"];
const OUTREACH_FILTERS: LeadPanelFilterId[] = ["email_sent", "not_sent", "draft_ready", "contact_ready"];

/** Within each group, any active filter may match (OR). Groups still combine with AND. */
const PANEL_FILTER_OR_GROUPS: LeadPanelFilterId[][] = [
  EMAIL_TYPE_FILTERS,
  EMAIL_STATUS_FILTERS,
  OUTREACH_FILTERS,
];

export const LEAD_QUICK_FILTERS: { id: LeadQuickFilterId; label: string }[] = [
  { id: "ready_to_write", label: "Ready to write" },
  { id: "ready_to_send", label: "Ready to send" },
  { id: "awaiting_reply", label: "Awaiting reply" },
  { id: "replied", label: "Replied" },
  { id: "has_mobile", label: "Has mobile" },
  { id: "needs_email", label: "Needs email" },
];

export const LEAD_PANEL_FILTER_GROUPS: {
  id: string;
  label: string;
  filters: { id: LeadPanelFilterId; label: string }[];
}[] = [
  {
    id: "email",
    label: "Email",
    filters: [
      { id: "business_email", label: "Business email" },
      { id: "personal_email", label: "Personal email" },
      { id: "generic_inbox", label: "Generic inbox" },
      { id: "no_email", label: "No email" },
      { id: "verified_email", label: "Verified" },
      { id: "unverified_email", label: "Unverified" },
    ],
  },
  {
    id: "contact",
    label: "Contact",
    filters: [
      { id: "has_mobile", label: "Has mobile" },
      { id: "has_linkedin", label: "Has LinkedIn" },
    ],
  },
  {
    id: "outreach",
    label: "Outreach",
    filters: [
      { id: "email_sent", label: "Email sent" },
      { id: "not_sent", label: "Not sent" },
      { id: "draft_ready", label: "Draft ready" },
      { id: "contact_ready", label: "Contact ready" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    filters: [
      { id: "high_score", label: "High score" },
      { id: "pinned", label: "Pinned" },
      { id: "excel_import", label: "Excel import" },
    ],
  },
];

export const LEAD_QUEUE_SORT_OPTIONS: { value: LeadQueueSort; label: string }[] = [
  { value: "date_newest", label: "Date newest" },
  { value: "date_oldest", label: "Date oldest" },
  { value: "score", label: "Score" },
];

const PANEL_LABELS = Object.fromEntries(
  LEAD_PANEL_FILTER_GROUPS.flatMap((group) => group.filters.map((f) => [f.id, f.label])),
) as Record<LeadPanelFilterId, string>;

export function panelFilterLabel(id: LeadPanelFilterId): string {
  return PANEL_LABELS[id] ?? id;
}

export function hasLeadMobile(lead: Pick<LeadQueueItem, "phone">): boolean {
  if (sanitizePhone(lead.phone)) return true;
  const digits = lead.phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 8;
}

export function classifyLeadEmail(lead: Pick<LeadQueueItem, "email" | "emailStatus">): LeadEmailKind {
  const email = lead.email?.trim() ?? "";
  if (!email || lead.emailStatus === "missing") return "missing";
  if (lead.emailStatus === "generic" || isGenericCompanyEmail(email)) return "generic";
  if (isPersonalInboxDomain(email)) return "personal";
  return "business";
}

function matchesQuickFilter(lead: LeadQueueItem, id: LeadQuickFilterId): boolean {
  switch (id) {
    case "ready_to_write":
      return isContactReadyStage(lead.status) && classifyLeadEmail(lead) === "business";
    case "ready_to_send":
      return lead.status === "draft_ready" || lead.status === "approved";
    case "awaiting_reply":
      return lead.status === "outreached";
    case "replied":
      return lead.status === "replied" || isPastReplyStage(lead.status);
    case "has_mobile":
      return hasLeadMobile(lead);
    case "needs_email": {
      const kind = classifyLeadEmail(lead);
      return kind === "missing" || kind === "generic" || kind === "personal";
    }
  }
}

function matchesPanelFilter(lead: LeadQueueItem, id: LeadPanelFilterId): boolean {
  switch (id) {
    case "business_email":
      return classifyLeadEmail(lead) === "business";
    case "personal_email":
      return classifyLeadEmail(lead) === "personal";
    case "generic_inbox":
      return classifyLeadEmail(lead) === "generic";
    case "no_email":
      return classifyLeadEmail(lead) === "missing";
    case "verified_email":
      return lead.emailStatus === "verified";
    case "unverified_email":
      return lead.emailStatus === "unverified";
    case "has_mobile":
      return hasLeadMobile(lead);
    case "has_linkedin":
      return Boolean(lead.linkedIn?.trim());
    case "email_sent":
      return statusToPipelineIndex(lead.status) >= 2;
    case "not_sent":
      return statusToPipelineIndex(lead.status) < 2;
    case "draft_ready":
      return lead.status === "draft_ready" || lead.status === "approved";
    case "contact_ready":
      return isContactReadyStage(lead.status);
    case "high_score":
      return (lead.score ?? 0) >= 70;
    case "pinned":
      return Boolean(lead.isPinned);
    case "excel_import":
      return lead.leadSource === "csv_import";
  }
}

export type LeadFilterState = {
  quick: LeadQuickFilterId | null;
  panel: Set<LeadPanelFilterId>;
  /** null = All users */
  addedByUserId: string | null;
};

export function emptyLeadFilterState(): LeadFilterState {
  return { quick: null, panel: new Set(), addedByUserId: null };
}

export function leadMatchesFilters(lead: LeadQueueItem, state: LeadFilterState): boolean {
  if (state.addedByUserId && lead.createdByUserId !== state.addedByUserId) return false;
  if (state.quick && !matchesQuickFilter(lead, state.quick)) return false;

  const remaining = new Set(state.panel);
  for (const group of PANEL_FILTER_OR_GROUPS) {
    const activeInGroup = group.filter((id) => remaining.has(id));
    if (!activeInGroup.length) continue;
    if (!activeInGroup.some((id) => matchesPanelFilter(lead, id))) return false;
    for (const id of activeInGroup) remaining.delete(id);
  }

  for (const id of remaining) {
    if (!matchesPanelFilter(lead, id)) return false;
  }
  return true;
}

export function filterLeadsByFilters(leads: LeadQueueItem[], state: LeadFilterState): LeadQueueItem[] {
  if (!state.quick && state.panel.size === 0 && !state.addedByUserId) return leads;
  return leads.filter((lead) => leadMatchesFilters(lead, state));
}

export function filterLeadsByQuery(leads: LeadQueueItem[], query: string): LeadQueueItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return leads;
  return leads.filter((item) =>
    [item.name, item.company, item.employees, item.title, item.city, item.status, item.action, item.emailStatus, item.email, item.createdByName]
      .some((field) => field?.toLowerCase().includes(q)),
  );
}

export function applyLeadListView(
  leads: LeadQueueItem[],
  params: { search: string; filters: LeadFilterState; sort: LeadQueueSort },
): LeadQueueItem[] {
  return sortLeadsQueue(
    filterLeadsByFilters(filterLeadsByQuery(leads, params.search), params.filters),
    params.sort,
  );
}

export function toggleQuickFilter(
  current: LeadQuickFilterId | null,
  id: LeadQuickFilterId,
): LeadQuickFilterId | null {
  return current === id ? null : id;
}

export function togglePanelFilter(active: Set<LeadPanelFilterId>, id: LeadPanelFilterId): Set<LeadPanelFilterId> {
  const next = new Set(active);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function parseLeadQueueSort(value: string | null | undefined): LeadQueueSort {
  if (value === "date_oldest" || value === "oldest") return "date_oldest";
  if (value === "date_newest" || value === "date" || value === "recent") return "date_newest";
  if (value === "score" || value === "score_desc" || value === "score_asc") return "score";
  return "score";
}

function createdAtMs(item: LeadQueueItem): number {
  if (!item.createdAt) return 0;
  const ms = new Date(item.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function sortLeadsQueue(leads: LeadQueueItem[], sort: LeadQueueSort): LeadQueueItem[] {
  return [...leads].sort((a, b) => {
    if (sort === "date_newest" || sort === "date_oldest") {
      const diff = createdAtMs(b) - createdAtMs(a);
      const ordered = sort === "date_oldest" ? -diff : diff;
      if (ordered !== 0) return ordered;
      return a.name.localeCompare(b.name);
    }
    const diff = (b.score ?? 0) - (a.score ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export function parseQuickFilter(value: string | null | undefined): LeadQuickFilterId | null {
  if (!value) return null;
  return LEAD_QUICK_FILTERS.some((item) => item.id === value) ? (value as LeadQuickFilterId) : null;
}

export function parsePanelFilters(raw: string | null | undefined): Set<LeadPanelFilterId> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const allowed = new Set(LEAD_PANEL_FILTER_GROUPS.flatMap((g) => g.filters.map((f) => f.id)));
    return new Set(parsed.filter((id): id is LeadPanelFilterId => typeof id === "string" && allowed.has(id as LeadPanelFilterId)));
  } catch {
    return new Set();
  }
}

export function parseAddedByUserId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function activeFilterSummary(state: LeadFilterState, addedByLabel?: string | null): string[] {
  const bits: string[] = [];
  if (state.addedByUserId) {
    bits.push(addedByLabel ? `Added by ${addedByLabel}` : "Added by user");
  }
  if (state.quick) {
    bits.push(LEAD_QUICK_FILTERS.find((f) => f.id === state.quick)?.label ?? state.quick);
  }
  for (const id of state.panel) bits.push(panelFilterLabel(id));
  return bits;
}
