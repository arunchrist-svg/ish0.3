import type { DirectoryCompany, DirectoryContact } from "@/lib/api-client";
import { classifyLeadEmail, hasLeadMobile } from "@/lib/leads/lead-filters";
import { formatCompanyScale } from "@/lib/enrichment/employee-size";
import { companyCityMatchesSelection } from "@/lib/enrichment/city-search";
import {
  SCOUT_BUSINESSES,
  SCOUT_INDUSTRIES,
} from "@/lib/scouting-data";
import {
  isContactReadyStage,
  statusToPipelineIndex,
} from "@/lib/pipeline-status";

export const ACCOUNT_COMPANY_QUICK_STORAGE_KEY = "ish-accounts-company-quick";
export const ACCOUNT_COMPANY_PANEL_STORAGE_KEY = "ish-accounts-company-panel";
export const ACCOUNT_COMPANY_SORT_STORAGE_KEY = "ish-accounts-company-sort";
export const ACCOUNT_CONTACT_QUICK_STORAGE_KEY = "ish-accounts-contact-quick";
export const ACCOUNT_CONTACT_PANEL_STORAGE_KEY = "ish-accounts-contact-panel";
export const ACCOUNT_CONTACT_SORT_STORAGE_KEY = "ish-accounts-contact-sort";

export type AccountCompanyQuickId = "has_contacts" | "high_fit" | "has_website" | "no_website";

export type AccountCompanyStaticPanelId =
  | "has_website"
  | "no_website"
  | "high_fit"
  | "has_overview"
  | "has_contacts"
  | "no_contacts"
  | "scale_micro"
  | "scale_small"
  | "scale_medium"
  | "scale_large"
  | "scale_unknown";

/** Static scout facets plus dynamic `city:`, `industry:`, `business:` ids. */
export type AccountCompanyPanelId = AccountCompanyStaticPanelId | string;

export type AccountCompanySort =
  | "name"
  | "fit_score"
  | "city"
  | "date_newest"
  | "date_oldest";

export type AccountContactQuickId = "has_mobile" | "needs_email" | "high_score" | "key_dm";

export type AccountContactStaticPanelId =
  | "business_email"
  | "personal_email"
  | "generic_inbox"
  | "no_email"
  | "verified_email"
  | "unverified_email"
  | "has_mobile"
  | "has_linkedin"
  | "key_dm"
  | "email_sent"
  | "not_sent"
  | "draft_ready"
  | "contact_ready"
  | "high_score"
  | "excel_import";

export type AccountContactPanelId = AccountContactStaticPanelId | string;

export type AccountContactSort = "date_newest" | "date_oldest" | "score" | "name";

const SCALE_FILTERS: AccountCompanyStaticPanelId[] = [
  "scale_micro",
  "scale_small",
  "scale_medium",
  "scale_large",
  "scale_unknown",
];

const COMPANY_STATIC_IDS: AccountCompanyStaticPanelId[] = [
  "has_website",
  "no_website",
  "high_fit",
  "has_overview",
  "has_contacts",
  "no_contacts",
  ...SCALE_FILTERS,
];

const EMAIL_TYPE_FILTERS: AccountContactStaticPanelId[] = [
  "business_email",
  "personal_email",
  "generic_inbox",
  "no_email",
];
const EMAIL_STATUS_FILTERS: AccountContactStaticPanelId[] = ["verified_email", "unverified_email"];
const OUTREACH_FILTERS: AccountContactStaticPanelId[] = [
  "email_sent",
  "not_sent",
  "draft_ready",
  "contact_ready",
];

const CONTACT_STATIC_IDS: AccountContactStaticPanelId[] = [
  ...EMAIL_TYPE_FILTERS,
  ...EMAIL_STATUS_FILTERS,
  "has_mobile",
  "has_linkedin",
  "key_dm",
  ...OUTREACH_FILTERS,
  "high_score",
  "excel_import",
];

export const ACCOUNT_COMPANY_QUICK: { id: AccountCompanyQuickId; label: string }[] = [
  { id: "has_contacts", label: "Has contacts" },
  { id: "high_fit", label: "High fit" },
  { id: "has_website", label: "Has website" },
  { id: "no_website", label: "Needs website" },
];

const COMPANY_QUALITY_GROUP = {
  id: "company",
  label: "Company",
  filters: [
    { id: "has_website" as const, label: "Has website" },
    { id: "no_website" as const, label: "Needs website" },
    { id: "high_fit" as const, label: "High fit" },
    { id: "has_overview" as const, label: "Has overview" },
    { id: "has_contacts" as const, label: "Has lead contacts" },
    { id: "no_contacts" as const, label: "No lead contacts" },
  ],
};

const COMPANY_SCALE_GROUP = {
  id: "scale",
  label: "Scale",
  filters: [
    { id: "scale_micro" as const, label: "Micro" },
    { id: "scale_small" as const, label: "Small scale" },
    { id: "scale_medium" as const, label: "Medium scale" },
    { id: "scale_large" as const, label: "Large scale" },
    { id: "scale_unknown" as const, label: "Unknown scale" },
  ],
};

/** @deprecated Prefer buildAccountCompanyPanelGroups(cities) for Location. */
export const ACCOUNT_COMPANY_PANEL_GROUPS = [
  COMPANY_QUALITY_GROUP,
  COMPANY_SCALE_GROUP,
  {
    id: "industry",
    label: "Industry",
    filters: SCOUT_INDUSTRIES.map((label) => ({ id: industryFilterId(label), label })),
  },
  {
    id: "business",
    label: "Business",
    filters: SCOUT_BUSINESSES.map((label) => ({ id: businessFilterId(label), label })),
  },
];

export const ACCOUNT_COMPANY_SORT_OPTIONS: { value: AccountCompanySort; label: string }[] = [
  { value: "date_newest", label: "Date newest" },
  { value: "date_oldest", label: "Date oldest" },
  { value: "name", label: "Name" },
  { value: "fit_score", label: "Fit score" },
  { value: "city", label: "City" },
];

export const ACCOUNT_CONTACT_QUICK: { id: AccountContactQuickId; label: string }[] = [
  { id: "has_mobile", label: "Has mobile" },
  { id: "needs_email", label: "Needs email" },
  { id: "high_score", label: "High score" },
  { id: "key_dm", label: "Key decision maker" },
];

const CONTACT_EMAIL_GROUP = {
  id: "email",
  label: "Email",
  filters: [
    { id: "business_email" as const, label: "Business email" },
    { id: "personal_email" as const, label: "Personal email" },
    { id: "generic_inbox" as const, label: "Generic inbox" },
    { id: "no_email" as const, label: "No email" },
    { id: "verified_email" as const, label: "Verified" },
    { id: "unverified_email" as const, label: "Unverified" },
  ],
};

const CONTACT_FIELDS_GROUP = {
  id: "contact",
  label: "Contact",
  filters: [
    { id: "has_mobile" as const, label: "Has mobile" },
    { id: "has_linkedin" as const, label: "Has LinkedIn" },
    { id: "key_dm" as const, label: "Key decision maker" },
  ],
};

const CONTACT_OUTREACH_GROUP = {
  id: "outreach",
  label: "Outreach",
  filters: [
    { id: "email_sent" as const, label: "Email sent" },
    { id: "not_sent" as const, label: "Not sent" },
    { id: "draft_ready" as const, label: "Draft ready" },
    { id: "contact_ready" as const, label: "Contact ready" },
  ],
};

const CONTACT_QUALITY_GROUP = {
  id: "quality",
  label: "Quality",
  filters: [
    { id: "high_score" as const, label: "High score" },
    { id: "excel_import" as const, label: "Excel import" },
  ],
};

/** @deprecated Prefer buildAccountContactPanelGroups(cities). */
export const ACCOUNT_CONTACT_PANEL_GROUPS = [
  CONTACT_EMAIL_GROUP,
  CONTACT_FIELDS_GROUP,
  CONTACT_OUTREACH_GROUP,
  CONTACT_QUALITY_GROUP,
  {
    id: "industry",
    label: "Industry",
    filters: SCOUT_INDUSTRIES.map((label) => ({ id: industryFilterId(label), label })),
  },
  {
    id: "business",
    label: "Business",
    filters: SCOUT_BUSINESSES.map((label) => ({ id: businessFilterId(label), label })),
  },
];

export const ACCOUNT_CONTACT_SORT_OPTIONS: { value: AccountContactSort; label: string }[] = [
  { value: "date_newest", label: "Date newest" },
  { value: "date_oldest", label: "Date oldest" },
  { value: "score", label: "Score" },
  { value: "name", label: "Name" },
];

export function cityFilterId(city: string): string {
  return `city:${city.trim()}`;
}

export function industryFilterId(label: string): string {
  return `industry:${label}`;
}

export function businessFilterId(label: string): string {
  return `business:${label}`;
}

export function parseCityFilterId(id: string): string | null {
  return id.startsWith("city:") ? id.slice("city:".length) : null;
}

export function parseIndustryFilterId(id: string): string | null {
  return id.startsWith("industry:") ? id.slice("industry:".length) : null;
}

export function parseBusinessFilterId(id: string): string | null {
  return id.startsWith("business:") ? id.slice("business:".length) : null;
}

function isBlankGeo(value: string | null | undefined): boolean {
  const t = value?.trim() ?? "";
  return !t || t === "-" || t === "—" || /^n\/?a$/i.test(t) || t.toLowerCase() === "unknown";
}

/** Unique cities from accounts for Location filters. */
export function collectAccountCities(
  companies: Array<{ city?: string | null }>,
): string[] {
  const set = new Set<string>();
  for (const company of companies) {
    const city = company.city?.trim();
    if (!city || isBlankGeo(city)) continue;
    set.add(city);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function buildAccountCompanyPanelGroups(cities: string[]): {
  id: string;
  label: string;
  filters: { id: string; label: string }[];
}[] {
  const groups: { id: string; label: string; filters: { id: string; label: string }[] }[] = [];
  if (cities.length) {
    groups.push({
      id: "location",
      label: "Location",
      filters: cities.map((city) => ({ id: cityFilterId(city), label: city })),
    });
  }
  groups.push({
    id: "industry",
    label: "Industry",
    filters: SCOUT_INDUSTRIES.map((label) => ({ id: industryFilterId(label), label })),
  });
  groups.push({
    id: "business",
    label: "Business",
    filters: SCOUT_BUSINESSES.map((label) => ({ id: businessFilterId(label), label })),
  });
  groups.push(COMPANY_SCALE_GROUP);
  groups.push(COMPANY_QUALITY_GROUP);
  return groups;
}

export function buildAccountContactPanelGroups(cities: string[]): {
  id: string;
  label: string;
  filters: { id: string; label: string }[];
}[] {
  const groups: { id: string; label: string; filters: { id: string; label: string }[] }[] = [];
  if (cities.length) {
    groups.push({
      id: "location",
      label: "Location",
      filters: cities.map((city) => ({ id: cityFilterId(city), label: city })),
    });
  }
  groups.push({
    id: "industry",
    label: "Industry",
    filters: SCOUT_INDUSTRIES.map((label) => ({ id: industryFilterId(label), label })),
  });
  groups.push({
    id: "business",
    label: "Business",
    filters: SCOUT_BUSINESSES.map((label) => ({ id: businessFilterId(label), label })),
  });
  groups.push(CONTACT_EMAIL_GROUP);
  groups.push(CONTACT_FIELDS_GROUP);
  groups.push(CONTACT_OUTREACH_GROUP);
  groups.push(CONTACT_QUALITY_GROUP);
  return groups;
}

function normalizeVerticalLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function verticalMatches(accountVertical: string, selected: string): boolean {
  if (isBlankGeo(accountVertical)) return false;
  const a = normalizeVerticalLabel(accountVertical);
  const b = normalizeVerticalLabel(selected);
  return a === b || a.includes(b) || b.includes(a);
}

function hasWebsite(company: DirectoryCompany): boolean {
  return Boolean(company.domain?.trim() || company.website?.trim());
}

function companyScaleId(company: DirectoryCompany): AccountCompanyStaticPanelId {
  const label = formatCompanyScale(company.employees);
  if (label === "Micro Industries") return "scale_micro";
  if (label === "Small scale") return "scale_small";
  if (label === "Medium scale") return "scale_medium";
  if (label === "Large scale") return "scale_large";
  return "scale_unknown";
}

function companyDateMs(company: DirectoryCompany): number {
  const raw = company.updatedAt || company.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function matchesCompanyQuick(company: DirectoryCompany, id: AccountCompanyQuickId): boolean {
  switch (id) {
    case "has_contacts":
      return company.contacts.length > 0;
    case "high_fit":
      return (company.fitScore ?? 0) >= 70;
    case "has_website":
      return hasWebsite(company);
    case "no_website":
      return !hasWebsite(company);
  }
}

function matchesCompanyPanel(company: DirectoryCompany, id: string): boolean {
  const city = parseCityFilterId(id);
  if (city) return companyCityMatchesSelection(company.city, [city]);

  const industry = parseIndustryFilterId(id);
  if (industry) return verticalMatches(company.industry, industry);

  const business = parseBusinessFilterId(id);
  if (business) return verticalMatches(company.industry, business);

  switch (id as AccountCompanyStaticPanelId) {
    case "has_website":
      return hasWebsite(company);
    case "no_website":
      return !hasWebsite(company);
    case "high_fit":
      return (company.fitScore ?? 0) >= 70;
    case "has_overview":
      return Boolean(company.companyOverview);
    case "has_contacts":
      return company.contacts.length > 0;
    case "no_contacts":
      return company.contacts.length === 0;
    case "scale_micro":
    case "scale_small":
    case "scale_medium":
    case "scale_large":
    case "scale_unknown":
      return companyScaleId(company) === id;
    default:
      return false;
  }
}

function matchesContactQuick(contact: DirectoryContact, id: AccountContactQuickId): boolean {
  switch (id) {
    case "has_mobile":
      return hasLeadMobile(contact);
    case "needs_email": {
      const kind = classifyLeadEmail(contact);
      return kind === "missing" || kind === "generic" || kind === "personal";
    }
    case "high_score":
      return (contact.score ?? 0) >= 70;
    case "key_dm":
      return Boolean(contact.isKeyDM);
  }
}

function matchesContactPanel(contact: DirectoryContact, id: string): boolean {
  const city = parseCityFilterId(id);
  if (city) return companyCityMatchesSelection(contact.companyCity, [city]);

  const industry = parseIndustryFilterId(id);
  if (industry) return verticalMatches(contact.companyIndustry, industry);

  const business = parseBusinessFilterId(id);
  if (business) return verticalMatches(contact.companyIndustry, business);

  switch (id as AccountContactStaticPanelId) {
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
      return hasLeadMobile(contact);
    case "has_linkedin":
      return Boolean(contact.linkedIn?.trim());
    case "key_dm":
      return Boolean(contact.isKeyDM);
    case "email_sent":
      return statusToPipelineIndex(contact.status) >= 2;
    case "not_sent":
      return statusToPipelineIndex(contact.status) < 2;
    case "draft_ready":
      return contact.status === "draft_ready" || contact.status === "approved";
    case "contact_ready":
      return isContactReadyStage(contact.status);
    case "high_score":
      return (contact.score ?? 0) >= 70;
    case "excel_import":
      return contact.leadSource === "csv_import";
    default:
      return false;
  }
}

function partitionDynamicFilters(panel: Set<string>): {
  cities: string[];
  industries: string[];
  businesses: string[];
  remaining: Set<string>;
} {
  const cities: string[] = [];
  const industries: string[] = [];
  const businesses: string[] = [];
  const remaining = new Set<string>();
  for (const id of panel) {
    const city = parseCityFilterId(id);
    if (city) {
      cities.push(city);
      continue;
    }
    const industry = parseIndustryFilterId(id);
    if (industry) {
      industries.push(industry);
      continue;
    }
    const business = parseBusinessFilterId(id);
    if (business) {
      businesses.push(business);
      continue;
    }
    remaining.add(id);
  }
  return { cities, industries, businesses, remaining };
}

function matchesOrGroups(
  remaining: Set<string>,
  groups: string[][],
  match: (id: string) => boolean,
): boolean {
  const left = new Set(remaining);
  for (const group of groups) {
    const active = group.filter((id) => left.has(id));
    for (const id of active) left.delete(id);
    if (active.length && !active.some(match)) return false;
  }
  for (const id of left) {
    if (!match(id)) return false;
  }
  return true;
}

export function companyMatchesAccountFilters(
  company: DirectoryCompany,
  quick: AccountCompanyQuickId | null,
  panel: Set<string>,
): boolean {
  if (quick && !matchesCompanyQuick(company, quick)) return false;

  const { cities, industries, businesses, remaining } = partitionDynamicFilters(panel);
  if (cities.length && !cities.some((city) => companyCityMatchesSelection(company.city, [city]))) {
    return false;
  }
  if (industries.length && !industries.some((label) => verticalMatches(company.industry, label))) {
    return false;
  }
  if (businesses.length && !businesses.some((label) => verticalMatches(company.industry, label))) {
    return false;
  }

  return matchesOrGroups(remaining, [SCALE_FILTERS], (id) => matchesCompanyPanel(company, id));
}

export function contactMatchesAccountFilters(
  contact: DirectoryContact,
  quick: AccountContactQuickId | null,
  panel: Set<string>,
): boolean {
  if (quick && !matchesContactQuick(contact, quick)) return false;

  const { cities, industries, businesses, remaining } = partitionDynamicFilters(panel);
  if (
    cities.length &&
    !cities.some((city) => companyCityMatchesSelection(contact.companyCity, [city]))
  ) {
    return false;
  }
  if (
    industries.length &&
    !industries.some((label) => verticalMatches(contact.companyIndustry, label))
  ) {
    return false;
  }
  if (
    businesses.length &&
    !businesses.some((label) => verticalMatches(contact.companyIndustry, label))
  ) {
    return false;
  }

  return matchesOrGroups(
    remaining,
    [EMAIL_TYPE_FILTERS, EMAIL_STATUS_FILTERS, OUTREACH_FILTERS],
    (id) => matchesContactPanel(contact, id),
  );
}

export function sortAccountCompanies(
  companies: DirectoryCompany[],
  sort: AccountCompanySort,
): DirectoryCompany[] {
  const next = [...companies];
  next.sort((a, b) => {
    if (sort === "fit_score") return (b.fitScore ?? 0) - (a.fitScore ?? 0);
    if (sort === "city") return a.city.localeCompare(b.city) || a.name.localeCompare(b.name);
    if (sort === "date_newest") return companyDateMs(b) - companyDateMs(a) || a.name.localeCompare(b.name);
    if (sort === "date_oldest") return companyDateMs(a) - companyDateMs(b) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  return next;
}

export function sortAccountContacts(
  contacts: DirectoryContact[],
  sort: AccountContactSort,
): DirectoryContact[] {
  const next = [...contacts];
  next.sort((a, b) => {
    if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
    if (sort === "name") return a.name.localeCompare(b.name);
    const aTime = new Date(a.savedAt).getTime();
    const bTime = new Date(b.savedAt).getTime();
    if (sort === "date_oldest") return aTime - bTime;
    return bTime - aTime;
  });
  return next;
}

export function filterAccountCompaniesByQuery(
  companies: DirectoryCompany[],
  query: string,
): DirectoryCompany[] {
  const q = query.trim().toLowerCase();
  if (!q) return companies;
  return companies.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q),
  );
}

export function filterAccountContactsByQuery(
  contacts: DirectoryContact[],
  query: string,
): DirectoryContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.companyName.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.companyCity.toLowerCase().includes(q) ||
      c.companyIndustry.toLowerCase().includes(q),
  );
}

export function applyAccountCompanyView(
  companies: DirectoryCompany[],
  opts: {
    query: string;
    quick: AccountCompanyQuickId | null;
    panel: Set<string>;
    sort: AccountCompanySort;
  },
): DirectoryCompany[] {
  const searched = filterAccountCompaniesByQuery(companies, opts.query);
  const filtered = searched.filter((c) =>
    companyMatchesAccountFilters(c, opts.quick, opts.panel),
  );
  return sortAccountCompanies(filtered, opts.sort);
}

export function applyAccountContactView(
  contacts: DirectoryContact[],
  opts: {
    query: string;
    quick: AccountContactQuickId | null;
    panel: Set<string>;
    sort: AccountContactSort;
  },
): DirectoryContact[] {
  const searched = filterAccountContactsByQuery(contacts, opts.query);
  const filtered = searched.filter((c) =>
    contactMatchesAccountFilters(c, opts.quick, opts.panel),
  );
  return sortAccountContacts(filtered, opts.sort);
}

export function isAccountCompanyPanelId(id: string): boolean {
  if (COMPANY_STATIC_IDS.includes(id as AccountCompanyStaticPanelId)) return true;
  if (parseCityFilterId(id)) return true;
  if (parseIndustryFilterId(id) && SCOUT_INDUSTRIES.includes(parseIndustryFilterId(id)! as (typeof SCOUT_INDUSTRIES)[number])) {
    return true;
  }
  if (parseBusinessFilterId(id) && SCOUT_BUSINESSES.includes(parseBusinessFilterId(id)! as (typeof SCOUT_BUSINESSES)[number])) {
    return true;
  }
  // Allow persisted cities that are no longer in the list.
  return Boolean(parseCityFilterId(id));
}

export function isAccountContactPanelId(id: string): boolean {
  if (CONTACT_STATIC_IDS.includes(id as AccountContactStaticPanelId)) return true;
  if (parseCityFilterId(id)) return true;
  const industry = parseIndustryFilterId(id);
  if (industry && SCOUT_INDUSTRIES.includes(industry as (typeof SCOUT_INDUSTRIES)[number])) return true;
  const business = parseBusinessFilterId(id);
  if (business && SCOUT_BUSINESSES.includes(business as (typeof SCOUT_BUSINESSES)[number])) return true;
  return false;
}

export function parseStoredSet<T extends string>(
  raw: string | null,
  allowed: readonly T[] | ((id: string) => boolean),
): Set<T> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    if (typeof allowed === "function") {
      return new Set(
        parsed.filter((id): id is T => typeof id === "string" && allowed(id)),
      );
    }
    const allow = new Set(allowed);
    return new Set(parsed.filter((id): id is T => typeof id === "string" && allow.has(id as T)));
  } catch {
    return new Set();
  }
}

export function parseStoredQuick<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | null {
  if (!raw) return null;
  return allowed.includes(raw as T) ? (raw as T) : null;
}

export function parseStoredSort<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!raw) return fallback;
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
