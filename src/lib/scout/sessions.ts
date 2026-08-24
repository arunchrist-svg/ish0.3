import { and, desc, eq } from "drizzle-orm";
import {
  db,
  scoutSessions,
  type ScoutSessionFilters,
  type ScoutSessionPerson,
  type ScoutSessionUiState,
} from "@/db";
import type { ScoutCompanyResult } from "@/lib/enrichment/types";
import { EMPLOYEE_SIZE_BANDS, isEmployeeSizeBandId } from "@/lib/enrichment/employee-size";

export const SCOUT_SESSION_COMPANIES_CAP = 200;
export const SCOUT_SESSION_PEOPLE_CAP = 500;

export type ScoutSessionMode = "autopilot" | "search";

export type ScoutSessionSummary = {
  id: string;
  title: string;
  mode: ScoutSessionMode;
  companyCount: number;
  peopleCount: number;
  filters: ScoutSessionFilters;
  createdAt: string;
  updatedAt: string;
};

export type ScoutSessionDetail = ScoutSessionSummary & {
  companies: ScoutCompanyResult[];
  people: ScoutSessionPerson[];
  uiState: ScoutSessionUiState;
  warnings: string[];
  createdByUserId: string | null;
};

function bandLabel(id: string): string | null {
  if (!isEmployeeSizeBandId(id)) return null;
  return EMPLOYEE_SIZE_BANDS.find((band) => band.id === id)?.label ?? null;
}

function citiesTitlePart(cities: string[]): string {
  const cleaned = cities.map((c) => c.trim()).filter(Boolean);
  if (!cleaned.length) return "All locations";
  if (cleaned.length === 1) return cleaned[0]!;
  return `${cleaned[0]} +${cleaned.length - 1}`;
}

function verticalTitlePart(filters: Pick<ScoutSessionFilters, "industries" | "businesses" | "verticalScope">): string | null {
  const labels =
    filters.verticalScope === "businesses" ? filters.businesses : filters.industries;
  const cleaned = labels.map((s) => s.trim()).filter(Boolean);
  if (!cleaned.length) return null;
  if (cleaned.length === 1) return cleaned[0]!;
  const noun = filters.verticalScope === "businesses" ? "businesses" : "industries";
  return `${cleaned.length} ${noun}`;
}

function scaleTitlePart(employeeBands: string[]): string | null {
  const labels = employeeBands.map(bandLabel).filter((v): v is string => Boolean(v));
  if (!labels.length) return null;
  if (labels.length === 1) return labels[0]!;
  return labels.join(", ");
}

/** Auto label for History list, e.g. "Madras +6 · 18 industries · Medium scale". */
export function buildScoutSessionTitle(input: {
  mode: ScoutSessionMode;
  cities: string[];
  industries?: string[];
  businesses?: string[];
  employeeBands?: string[];
  verticalScope?: ScoutSessionFilters["verticalScope"];
  companyName?: string;
}): string {
  const name = input.companyName?.trim();
  if (input.mode === "search" && name) {
    const where = citiesTitlePart(input.cities);
    return where === "All locations" ? name : `${name} · ${where}`;
  }

  const parts: string[] = [citiesTitlePart(input.cities)];
  const vertical = verticalTitlePart({
    industries: input.industries ?? [],
    businesses: input.businesses ?? [],
    verticalScope: input.verticalScope ?? "industries",
  });
  if (vertical) parts.push(vertical);
  const scale = scaleTitlePart(input.employeeBands ?? []);
  if (scale) parts.push(scale);
  return parts.join(" · ");
}

export function capScoutSessionCompanies(companies: ScoutCompanyResult[]): ScoutCompanyResult[] {
  return companies.slice(0, SCOUT_SESSION_COMPANIES_CAP);
}

export function capScoutSessionPeople(people: ScoutSessionPerson[]): ScoutSessionPerson[] {
  return people.slice(0, SCOUT_SESSION_PEOPLE_CAP);
}

function normalizeFilters(filters: ScoutSessionFilters): ScoutSessionFilters {
  return {
    cities: filters.cities ?? [],
    industries: filters.industries ?? [],
    businesses: filters.businesses ?? [],
    employeeBands: filters.employeeBands ?? [],
    seniority: filters.seniority ?? [],
    departments: filters.departments ?? [],
    peopleCities: filters.peopleCities ?? [],
    locationScope: filters.locationScope === "focus" ? "focus" : "interest",
    verticalScope: filters.verticalScope === "businesses" ? "businesses" : "industries",
    ...(filters.companyName?.trim() ? { companyName: filters.companyName.trim() } : {}),
    ...(filters.searchKind ? { searchKind: filters.searchKind } : {}),
    ...(typeof filters.scoutCompaniesLimit === "number"
      ? { scoutCompaniesLimit: filters.scoutCompaniesLimit }
      : {}),
    ...(typeof filters.scoutLeadsLimit === "number" ? { scoutLeadsLimit: filters.scoutLeadsLimit } : {}),
  };
}

function normalizeUiState(uiState: ScoutSessionUiState): ScoutSessionUiState {
  return {
    selectedCompanyIds: uiState.selectedCompanyIds ?? [],
    selectedPersonIds: uiState.selectedPersonIds ?? [],
    primaryCompanyId: uiState.primaryCompanyId ?? null,
    primaryPersonId: uiState.primaryPersonId ?? null,
    view: uiState.view === "people" ? "people" : "companies",
    fetchSeed: typeof uiState.fetchSeed === "number" ? uiState.fetchSeed : 0,
    ...(typeof uiState.hasMore === "boolean" ? { hasMore: uiState.hasMore } : {}),
    ...(uiState.companySearchQuery != null ? { companySearchQuery: uiState.companySearchQuery } : {}),
  };
}

function toSummary(row: typeof scoutSessions.$inferSelect): ScoutSessionSummary {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode === "search" ? "search" : "autopilot",
    companyCount: row.companyCount,
    peopleCount: row.peopleCount,
    filters: normalizeFilters(row.filters),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: typeof scoutSessions.$inferSelect): ScoutSessionDetail {
  return {
    ...toSummary(row),
    companies: Array.isArray(row.companies) ? row.companies : [],
    people: Array.isArray(row.people) ? row.people : [],
    uiState: normalizeUiState(row.uiState),
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    createdByUserId: row.createdByUserId,
  };
}

export async function listScoutSessions(params: {
  tenantId: string;
  workspaceId: string;
  limit?: number;
}): Promise<ScoutSessionSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(scoutSessions)
    .where(
      and(eq(scoutSessions.tenantId, params.tenantId), eq(scoutSessions.workspaceId, params.workspaceId)),
    )
    .orderBy(desc(scoutSessions.updatedAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function getScoutSession(params: {
  tenantId: string;
  workspaceId: string;
  id: string;
}): Promise<ScoutSessionDetail | null> {
  const [row] = await db
    .select()
    .from(scoutSessions)
    .where(
      and(
        eq(scoutSessions.id, params.id),
        eq(scoutSessions.tenantId, params.tenantId),
        eq(scoutSessions.workspaceId, params.workspaceId),
      ),
    )
    .limit(1);
  return row ? toDetail(row) : null;
}

export async function createScoutSession(params: {
  tenantId: string;
  workspaceId: string;
  createdByUserId?: string | null;
  mode: ScoutSessionMode;
  filters: ScoutSessionFilters;
  companies?: ScoutCompanyResult[];
  people?: ScoutSessionPerson[];
  uiState?: ScoutSessionUiState;
  warnings?: string[];
  title?: string;
}): Promise<ScoutSessionDetail> {
  const filters = normalizeFilters(params.filters);
  const companies = capScoutSessionCompanies(params.companies ?? []);
  const people = capScoutSessionPeople(params.people ?? []);
  const uiState = normalizeUiState(
    params.uiState ?? {
      selectedCompanyIds: [],
      selectedPersonIds: [],
      view: "companies",
      fetchSeed: 0,
    },
  );
  const title =
    params.title?.trim() ||
    buildScoutSessionTitle({
      mode: params.mode,
      cities: filters.cities,
      industries: filters.industries,
      businesses: filters.businesses,
      employeeBands: filters.employeeBands,
      verticalScope: filters.verticalScope,
      companyName: filters.companyName,
    });

  const [row] = await db
    .insert(scoutSessions)
    .values({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      createdByUserId: params.createdByUserId ?? null,
      title,
      mode: params.mode,
      filters,
      companies,
      people,
      uiState,
      companyCount: companies.length,
      peopleCount: people.length,
      warnings: params.warnings ?? [],
    })
    .returning();

  return toDetail(row!);
}

export async function updateScoutSession(params: {
  tenantId: string;
  workspaceId: string;
  id: string;
  title?: string;
  mode?: ScoutSessionMode;
  filters?: ScoutSessionFilters;
  companies?: ScoutCompanyResult[];
  people?: ScoutSessionPerson[];
  uiState?: ScoutSessionUiState;
  warnings?: string[];
}): Promise<ScoutSessionDetail | null> {
  const existing = await getScoutSession(params);
  if (!existing) return null;

  const filters = params.filters ? normalizeFilters(params.filters) : existing.filters;
  const companies = params.companies
    ? capScoutSessionCompanies(params.companies)
    : existing.companies;
  const people = params.people ? capScoutSessionPeople(params.people) : existing.people;
  const uiState = params.uiState ? normalizeUiState(params.uiState) : existing.uiState;
  const mode = params.mode ?? existing.mode;
  const title =
    params.title?.trim() ||
    buildScoutSessionTitle({
      mode,
      cities: filters.cities,
      industries: filters.industries,
      businesses: filters.businesses,
      employeeBands: filters.employeeBands,
      verticalScope: filters.verticalScope,
      companyName: filters.companyName,
    });

  const [row] = await db
    .update(scoutSessions)
    .set({
      title,
      mode,
      filters,
      companies,
      people,
      uiState,
      companyCount: companies.length,
      peopleCount: people.length,
      warnings: params.warnings ?? existing.warnings,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scoutSessions.id, params.id),
        eq(scoutSessions.tenantId, params.tenantId),
        eq(scoutSessions.workspaceId, params.workspaceId),
      ),
    )
    .returning();

  return row ? toDetail(row) : null;
}

export async function deleteScoutSession(params: {
  tenantId: string;
  workspaceId: string;
  id: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(scoutSessions)
    .where(
      and(
        eq(scoutSessions.id, params.id),
        eq(scoutSessions.tenantId, params.tenantId),
        eq(scoutSessions.workspaceId, params.workspaceId),
      ),
    )
    .returning({ id: scoutSessions.id });
  return deleted.length > 0;
}
