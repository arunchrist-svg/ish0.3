import type { CampaignMode } from "@/lib/email/config";

export type OccasionKind = "event" | "program";

export type OccasionId =
  | "store_opening"
  | "office_inauguration"
  | "foundation_day"
  | "milestone"
  | "birthday"
  | "onboarding"
  | "appreciation"
  | "pantry"
  | "empanelment"
  | "dealer_meet"
  | "deal_close"
  | "client_visit";

export type OccasionDef = {
  id: OccasionId;
  kind: OccasionKind;
  label: string;
  pitch: string;
  /** Dedicated Tavily sweep (event track). */
  searchable: boolean;
  /** Shown in the Write-time occasion picker. */
  writeTheme: boolean;
};

export const OCCASION_CATALOG: OccasionDef[] = [
  {
    id: "store_opening",
    kind: "event",
    label: "Store opening",
    pitch: "Inauguration mithai for a store coming up, plus the next outlets this quarter",
    searchable: true,
    writeTheme: true,
  },
  {
    id: "office_inauguration",
    kind: "event",
    label: "Office or plant inauguration",
    pitch: "Desk or lobby mithai for inauguration week",
    searchable: true,
    writeTheme: true,
  },
  {
    id: "foundation_day",
    kind: "event",
    label: "Foundation day",
    pitch: "Employee and partner boxes for the anniversary week",
    searchable: true,
    writeTheme: true,
  },
  {
    id: "milestone",
    kind: "event",
    label: "Company milestone",
    pitch: "Celebration boxes for team and partners",
    searchable: true,
    writeTheme: true,
  },
  {
    id: "birthday",
    kind: "program",
    label: "Monthly birthdays",
    pitch: "Monthly birthday mithai or namkeen for that month's people",
    searchable: false,
    writeTheme: true,
  },
  {
    id: "onboarding",
    kind: "program",
    label: "New joiners",
    pitch: "Welcome box for campus and bulk hiring",
    searchable: false,
    writeTheme: true,
  },
  {
    id: "appreciation",
    kind: "program",
    label: "Appreciation",
    pitch: "Recognition, appraisal, or town-hall boxes",
    searchable: false,
    writeTheme: true,
  },
  {
    id: "pantry",
    kind: "program",
    label: "Office pantry",
    pitch: "Recurring namkeen and mithai for pantry and meetings",
    searchable: false,
    writeTheme: true,
  },
  {
    id: "empanelment",
    kind: "program",
    label: "Vendor empanelment",
    pitch: "Rate card and tasting so they can call for any occasion",
    searchable: false,
    writeTheme: true,
  },
  {
    id: "dealer_meet",
    kind: "program",
    label: "Dealer meet",
    pitch: "Channel-meet boxes (theme only, no dedicated search)",
    searchable: false,
    writeTheme: false,
  },
  {
    id: "deal_close",
    kind: "program",
    label: "Deal close",
    pitch: "Signing or handover boxes (theme only)",
    searchable: false,
    writeTheme: false,
  },
  {
    id: "client_visit",
    kind: "program",
    label: "Client visit",
    pitch: "Hospitality boxes for factory or HQ visits (theme only)",
    searchable: false,
    writeTheme: false,
  },
];

export const SEARCHABLE_OCCASION_IDS = OCCASION_CATALOG.filter((o) => o.searchable).map((o) => o.id);

export const WRITE_THEME_OCCASIONS = OCCASION_CATALOG.filter((o) => o.writeTheme);

export const FESTIVE_OCCASION_SENTINEL = "festive" as const;

export type WriteOccasionId = OccasionId | typeof FESTIVE_OCCASION_SENTINEL;

const OCCASION_BY_ID = new Map(OCCASION_CATALOG.map((o) => [o.id, o]));

export function getOccasion(id?: string | null): OccasionDef | null {
  if (!id) return null;
  return OCCASION_BY_ID.get(id as OccasionId) ?? null;
}

export function isOccasionId(value?: string | null): value is OccasionId {
  return Boolean(value && OCCASION_BY_ID.has(value as OccasionId));
}

export function occasionFromCampaignMode(mode?: CampaignMode | string | null): WriteOccasionId | null {
  if (mode === "year_round") return "empanelment";
  if (mode === "mass_ordering") return "empanelment";
  if (mode === "diwali_gifting" || mode === "festival_bundle") return FESTIVE_OCCASION_SENTINEL;
  return null;
}

export function isFestiveWriteOccasion(id?: string | null): boolean {
  return !id || id === FESTIVE_OCCASION_SENTINEL;
}

const OCCASION_ALIASES: Record<string, OccasionId> = {
  store_opening: "store_opening",
  "store opening": "store_opening",
  inauguration: "store_opening",
  "grand opening": "store_opening",
  "new store": "store_opening",
  "store launch": "store_opening",
  office_inauguration: "office_inauguration",
  "new office": "office_inauguration",
  "new campus": "office_inauguration",
  "plant inauguration": "office_inauguration",
  foundation_day: "foundation_day",
  "foundation day": "foundation_day",
  "company anniversary": "foundation_day",
  anniversary: "foundation_day",
  milestone: "milestone",
  funding: "milestone",
  ipo: "milestone",
  birthday: "birthday",
  "work anniversary": "appreciation",
  onboarding: "onboarding",
  "new joiner": "onboarding",
  appreciation: "appreciation",
  "women's day": "appreciation",
  pantry: "pantry",
  empanelment: "empanelment",
};

export function normalizeOccasionType(raw?: string | null): OccasionId | null {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase();
  if (OCCASION_BY_ID.has(key as OccasionId)) return key as OccasionId;
  if (OCCASION_ALIASES[key]) return OCCASION_ALIASES[key];
  for (const [alias, id] of Object.entries(OCCASION_ALIASES)) {
    if (key.includes(alias)) return id;
  }
  return null;
}

export function occasionTag(id: WriteOccasionId): string {
  return `occasion:${id}`;
}

export function occasionIdFromTags(tags?: string[] | null): WriteOccasionId | null {
  const tag = (tags ?? []).find((t) => t.startsWith("occasion:"));
  if (!tag) return null;
  const id = tag.slice("occasion:".length);
  if (id === FESTIVE_OCCASION_SENTINEL) return FESTIVE_OCCASION_SENTINEL;
  return isOccasionId(id) ? id : null;
}

export function replaceOccasionTag(tags: string[] | undefined, id: WriteOccasionId): string[] {
  const without = (tags ?? []).filter((t) => !t.startsWith("occasion:"));
  return [...without, occasionTag(id)];
}

export type OccasionTiming = "upcoming" | "recent";

export function normalizeOccasionTiming(raw?: string | null): OccasionTiming | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase();
  if (key === "upcoming" || key === "coming_soon" || key === "soon" || key === "planned") {
    return "upcoming";
  }
  if (key === "recent" || key === "opened" || key === "past" || key === "already_opened") {
    return "recent";
  }
  return undefined;
}
