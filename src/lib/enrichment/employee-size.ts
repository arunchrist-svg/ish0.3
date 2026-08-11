export const EMPLOYEE_SIZE_BANDS = [
  {
    id: "micro",
    label: "Micro Industries",
    sublabel: "1-10 people",
    min: 1,
    max: 10,
    searchHint: "micro industry MSME 1-10 employees",
    apolloRanges: ["1,10"],
  },
  {
    id: "small",
    label: "Small scale",
    sublabel: "11-50 people",
    min: 11,
    max: 50,
    searchHint: "small scale industry SSI 11-50 employees",
    apolloRanges: ["11,50"],
  },
  {
    id: "medium",
    label: "Medium scale",
    sublabel: "51-250 people",
    min: 51,
    max: 250,
    searchHint: "medium scale industry 51-250 employees",
    apolloRanges: ["51,200"],
  },
  {
    id: "large",
    label: "Large scale",
    sublabel: "250+ people",
    min: 251,
    max: null,
    searchHint: "large scale industry 250+ employees",
    apolloRanges: ["201,500", "501,1000", "1001,5000", "5001,10000", "10001"],
  },
] as const;

export type EmployeeSizeBandId = (typeof EMPLOYEE_SIZE_BANDS)[number]["id"];

const BAND_BY_ID = new Map(EMPLOYEE_SIZE_BANDS.map((band) => [band.id, band]));

const SCALE_PATTERNS: { id: EmployeeSizeBandId; pattern: RegExp }[] = [
  { id: "large", pattern: /\blarge[\s-]+scale\b|\blarge[\s-]+industr(?:y|ies)\b|\bMNC\b/i },
  { id: "medium", pattern: /\bmedium[\s-]+scale\b|\bmid[\s-]*(?:size|scale)\b|\bmedium[\s-]+industr(?:y|ies)\b/i },
  { id: "small", pattern: /\bsmall[\s-]+scale\b|\bSSI\b|\bsmall[\s-]+industr(?:y|ies)\b/i },
  { id: "micro", pattern: /\bmicro[\s-]+industr(?:y|ies)\b|\bmicro[\s-]+(?:enterprise|scale|unit)s?\b|\bMSME[\s-]*micro\b/i },
];

export function isEmployeeSizeBandId(value: string): value is EmployeeSizeBandId {
  return BAND_BY_ID.has(value as EmployeeSizeBandId);
}

export function normalizeEmployeeBandIds(values: string[] | undefined): EmployeeSizeBandId[] {
  return [...new Set((values ?? []).filter(isEmployeeSizeBandId))];
}

function bandRange(id: EmployeeSizeBandId): { min: number; max: number } {
  const band = BAND_BY_ID.get(id)!;
  return { min: band.min, max: band.max ?? Number.POSITIVE_INFINITY };
}

function matchScaleId(raw: string): EmployeeSizeBandId | null {
  const lowered = raw.trim().toLowerCase();
  for (const band of EMPLOYEE_SIZE_BANDS) {
    if (band.id === lowered || band.label.toLowerCase() === lowered) return band.id;
  }
  for (const entry of SCALE_PATTERNS) {
    if (entry.pattern.test(raw)) return entry.id;
  }
  return null;
}

/** Parse a listing string like "8,500", "small scale", or "100+" into a numeric range. */
export function parseEmployeeRange(raw?: string | null): { min: number; max: number } | null {
  if (!raw?.trim() || raw.trim() === "—" || /^[-–]$|^n\/?a$|^unknown$|^null$/i.test(raw.trim())) return null;
  const scaleId = matchScaleId(raw);
  if (scaleId) return bandRange(scaleId);

  const cleaned = raw
    .replace(/employees?|staff|headcount|people|team size|workforce/gi, "")
    .replace(/,/g, "")
    .trim();
  const plus = cleaned.match(/(\d+)\s*\+/);
  if (plus) {
    const n = Number(plus[1]);
    return Number.isFinite(n) ? { min: n, max: Number.POSITIVE_INFINITY } : null;
  }
  const range = cleaned.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) return { min, max };
  }
  const single = cleaned.match(/(\d+)/);
  if (!single) return null;
  const n = Number(single[1]);
  return Number.isFinite(n) && n > 0 ? { min: n, max: n } : null;
}

export function scaleBandFromEmployees(raw?: string | null): (typeof EMPLOYEE_SIZE_BANDS)[number] | null {
  const range = parseEmployeeRange(raw);
  if (!range) return null;
  const n = range.max === Number.POSITIVE_INFINITY ? range.min : (range.min + range.max) / 2;
  return EMPLOYEE_SIZE_BANDS.find((band) => {
    const bandMax = band.max ?? Number.POSITIVE_INFINITY;
    return n >= band.min && n <= bandMax;
  }) ?? null;
}

/** Card / filter display: Micro Industries, Small scale, Medium scale, Large scale. */
export function formatCompanyScale(raw?: string | null): string {
  return scaleBandFromEmployees(raw)?.label ?? "-";
}

/** Numeric headcount for scout cards. Scale-only labels (no digits) return null. */
export function formatEmployeeCount(raw?: string | null): string | null {
  if (!raw?.trim() || !/\d/.test(raw)) return null;
  const range = parseEmployeeRange(raw);
  if (!range) return null;
  const fmt = (n: number) => n.toLocaleString("en-IN");
  if (range.max === Number.POSITIVE_INFINITY) return `${fmt(range.min)}+`;
  if (range.min === range.max) return fmt(range.min);
  return `${fmt(range.min)}-${fmt(range.max)}`;
}

/** Scout card line: "Large scale · 8,500" when both are known. */
export function formatScoutSizeLine(raw?: string | null): string {
  const scale = formatCompanyScale(raw);
  const count = formatEmployeeCount(raw);
  if (!count) return scale;
  if (scale === "-") return count;
  return `${scale} · ${count}`;
}

export function employeeMatchesBands(
  raw: string | null | undefined,
  bandIds: string[],
): boolean | "unknown" {
  const bands = normalizeEmployeeBandIds(bandIds);
  if (!bands.length) return true;
  const range = parseEmployeeRange(raw);
  if (!range) return "unknown";
  return bands.some((id) => {
    const band = BAND_BY_ID.get(id);
    if (!band) return false;
    const bandMax = band.max ?? Number.POSITIVE_INFINITY;
    return range.min <= bandMax && range.max >= band.min;
  });
}

export function employeeSizeSearchClause(bandIds?: string[]): string {
  const bands = normalizeEmployeeBandIds(bandIds);
  if (!bands.length) return "";
  return bands.map((id) => BAND_BY_ID.get(id)!.searchHint).join(" OR ");
}

/** Apollo organization_num_employees_ranges values for the selected UI bands. */
export function apolloEmployeeRanges(bandIds?: string[]): string[] {
  const bands = normalizeEmployeeBandIds(bandIds);
  const ranges = new Set<string>();
  for (const id of bands) {
    for (const value of BAND_BY_ID.get(id)?.apolloRanges ?? []) ranges.add(value);
  }
  return [...ranges];
}

export function extractEmployeesFromText(blob: string): string | undefined {
  const numeric = blob.match(
    /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:\+|[-–]\s*(?:\d{1,3}(?:,\d{3})+|\d+))?\s*(?:employees?|staff|headcount)\b/i,
  );
  if (numeric?.[0]) return numeric[0].trim();
  const scaleId = matchScaleId(blob);
  return scaleId ? BAND_BY_ID.get(scaleId)!.label : undefined;
}

export function rankAndFilterByEmployeeBands<T extends { employees?: string | null }>(
  companies: T[],
  bandIds: string[],
): { companies: T[]; unknownCount: number; droppedKnown: number } {
  const bands = normalizeEmployeeBandIds(bandIds);
  if (!bands.length) return { companies, unknownCount: 0, droppedKnown: 0 };

  const matched: T[] = [];
  const unknown: T[] = [];
  let droppedKnown = 0;
  for (const company of companies) {
    const result = employeeMatchesBands(company.employees, bands);
    if (result === true) matched.push(company);
    else if (result === "unknown") unknown.push(company);
    else droppedKnown += 1;
  }
  return { companies: [...matched, ...unknown], unknownCount: unknown.length, droppedKnown };
}
