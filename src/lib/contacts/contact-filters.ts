import type { ContactListItem } from "@/lib/api-client";
import { classifyLeadEmail, hasLeadMobile } from "@/lib/leads/lead-filters";

export const CONTACTS_QUICK_STORAGE_KEY = "ish-contacts-quick-filter";
export const CONTACTS_PANEL_STORAGE_KEY = "ish-contacts-panel-filters";
export const CONTACTS_SORT_STORAGE_KEY = "ish-contacts-sort";

export type ContactsQuickId =
  | "has_lead"
  | "no_lead"
  | "has_mobile"
  | "needs_email"
  | "key_dm";

export type ContactsPanelId =
  | "business_email"
  | "personal_email"
  | "generic_inbox"
  | "no_email"
  | "verified_email"
  | "unverified_email"
  | "has_mobile"
  | "has_linkedin"
  | "key_dm"
  | "has_lead"
  | "no_lead"
  | "high_score";

export type ContactsSort = "name" | "company" | "score" | "status";

const EMAIL_TYPE_FILTERS: ContactsPanelId[] = [
  "business_email",
  "personal_email",
  "generic_inbox",
  "no_email",
];
const EMAIL_STATUS_FILTERS: ContactsPanelId[] = ["verified_email", "unverified_email"];
const LEAD_FILTERS: ContactsPanelId[] = ["has_lead", "no_lead"];

const PANEL_OR_GROUPS: ContactsPanelId[][] = [
  EMAIL_TYPE_FILTERS,
  EMAIL_STATUS_FILTERS,
  LEAD_FILTERS,
];

export const CONTACTS_QUICK_FILTERS: { id: ContactsQuickId; label: string }[] = [
  { id: "has_lead", label: "Has lead" },
  { id: "no_lead", label: "No lead" },
  { id: "has_mobile", label: "Has mobile" },
  { id: "needs_email", label: "Needs email" },
  { id: "key_dm", label: "Key decision maker" },
];

export const CONTACTS_PANEL_FILTER_GROUPS: {
  id: string;
  label: string;
  filters: { id: ContactsPanelId; label: string }[];
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
      { id: "key_dm", label: "Key decision maker" },
    ],
  },
  {
    id: "lead",
    label: "Lead",
    filters: [
      { id: "has_lead", label: "Has lead" },
      { id: "no_lead", label: "No lead" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    filters: [{ id: "high_score", label: "High score" }],
  },
];

export const CONTACTS_SORT_OPTIONS: { value: ContactsSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
  { value: "score", label: "Score" },
  { value: "status", label: "Lead status" },
];

function matchesQuick(contact: ContactListItem, id: ContactsQuickId): boolean {
  switch (id) {
    case "has_lead":
      return contact.hasLead;
    case "no_lead":
      return !contact.hasLead;
    case "has_mobile":
      return hasLeadMobile({ phone: contact.phone ?? undefined });
    case "needs_email": {
      const kind = classifyLeadEmail(contact);
      return kind === "missing" || kind === "generic" || kind === "personal";
    }
    case "key_dm":
      return contact.isKeyDM;
  }
}

function matchesPanel(contact: ContactListItem, id: ContactsPanelId): boolean {
  switch (id) {
    case "business_email":
      return classifyLeadEmail(contact) === "business";
    case "personal_email":
      return classifyLeadEmail(contact) === "personal";
    case "generic_inbox":
      return classifyLeadEmail(contact) === "generic";
    case "no_email":
      return classifyLeadEmail(contact) === "missing";
    case "verified_email":
      return contact.emailStatus === "verified";
    case "unverified_email":
      return contact.emailStatus === "unverified";
    case "has_mobile":
      return hasLeadMobile({ phone: contact.phone ?? undefined });
    case "has_linkedin":
      return Boolean(contact.linkedIn?.trim());
    case "key_dm":
      return contact.isKeyDM;
    case "has_lead":
      return contact.hasLead;
    case "no_lead":
      return !contact.hasLead;
    case "high_score":
      return (contact.score ?? 0) >= 70;
  }
}

export function contactMatchesFilters(
  contact: ContactListItem,
  quick: ContactsQuickId | null,
  panel: Set<ContactsPanelId>,
): boolean {
  if (quick && !matchesQuick(contact, quick)) return false;

  const remaining = new Set(panel);
  for (const group of PANEL_OR_GROUPS) {
    const active = group.filter((id) => remaining.has(id));
    for (const id of active) remaining.delete(id);
    if (active.length && !active.some((id) => matchesPanel(contact, id))) return false;
  }
  for (const id of remaining) {
    if (!matchesPanel(contact, id)) return false;
  }
  return true;
}

export function sortContactsList(
  contacts: ContactListItem[],
  sort: ContactsSort,
): ContactListItem[] {
  const next = [...contacts];
  next.sort((a, b) => {
    if (sort === "company") return a.company.localeCompare(b.company) || a.name.localeCompare(b.name);
    if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
    if (sort === "status") {
      if (a.hasLead && !b.hasLead) return -1;
      if (!a.hasLead && b.hasLead) return 1;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
  return next;
}

export function applyContactsListView(
  contacts: ContactListItem[],
  opts: {
    query: string;
    quick: ContactsQuickId | null;
    panel: Set<ContactsPanelId>;
    sort: ContactsSort;
  },
): ContactListItem[] {
  const q = opts.query.trim().toLowerCase();
  let result = contacts;
  if (q) {
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }
  result = result.filter((c) => contactMatchesFilters(c, opts.quick, opts.panel));
  return sortContactsList(result, opts.sort);
}
