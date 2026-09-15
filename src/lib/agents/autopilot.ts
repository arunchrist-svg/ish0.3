import { discoverPeople } from "@/lib/enrichment/waterfall";
import { discoverAgenticCompaniesForScout } from "@/lib/agents/scout-agentic";
import { saveScoutLeads } from "@/lib/scout/save-leads";
import { applyAutopilotScoutDefaults, configUsesTavilyForCompanies, hasApolloKey } from "@/lib/enrichment/config";
import { peoplePerCompanyLimit } from "@/lib/enrichment/people-diversity";
import { getAgentFlags, isAutopilotEnabled } from "@/lib/settings/agent-flags";
import { assertCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { enqueueWriterForLeads } from "@/lib/jobs/enqueue";
import { mapWithConcurrency } from "@/lib/async";
import type { DataMode, ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";
import {
  AUTOPILOT_CHUNK_SIZE,
  AUTOPILOT_LEAD_SOURCE,
  AUTOPILOT_MAX_TRIES_PER_CHUNK,
  AUTOPILOT_OUTREACH_TEMPLATE,
  AUTOPILOT_PEOPLE_PER_COMPANY,
  AUTOPILOT_SENDS_EMAIL,
  AUTOPILOT_TARGET_COMPANIES,
  AUTOPILOT_TARGET_LEADS,
  applyGuessedEmail,
  autopilotExcludeNames,
  autopilotFocusIndustries,
  autopilotPeopleCities,
  autopilotPeopleSkipReason,
  autopilotSendsEmail,
  decideAfterAutopilotChunk,
  isAutopilotScheduleDue,
  isAutopilotTavilyExhausted,
  mergeAutopilotProgress,
  normalizeAutopilotSchedule,
  planDailyAutopilotAction,
  planNextAutopilotChunk,
  resolveAutopilotPeopleFilters,
  shouldFillAutopilotChunk,
} from "@/lib/agents/autopilot-logic";
import { blockReasonForCompany, loadAutopilotCompanyBlocks } from "@/lib/agents/autopilot-dedupe";
import {
  createAutopilotRun,
  deleteAutopilotRun as deleteAutopilotRunRow,
  getAutopilotRun,
  listAutopilotRuns,
  pauseAutopilotRun,
  updateAutopilotRun,
  type AutopilotRunRow,
} from "@/lib/agents/autopilot-store";
import type { AutopilotRunInput, AutopilotSchedule } from "@/db";

void AUTOPILOT_SENDS_EMAIL;

const PEOPLE_CONCURRENCY = 2;

export type AutopilotRunSettings = {
  cities?: string[];
  industries?: string[];
  businesses?: string[];
  employeeBands?: string[];
  seniority?: string[];
  departments?: string[];
  locationScope?: "focus" | "interest";
  outreachTemplate?: string;
  schedule?: Partial<AutopilotSchedule> | null;
  autoSend?: boolean;
  runNow?: boolean;
};

export type StartAutopilotParams = AutopilotRunSettings & {
  tenantId: string;
  workspaceId: string;
  userId?: string;
};

export function buildAutopilotInput(params: AutopilotRunSettings): AutopilotRunInput {
  const people = resolveAutopilotPeopleFilters({
    seniority: params.seniority,
    departments: params.departments,
  });
  const autoSend = params.autoSend !== false;
  return {
    cities: params.cities ?? [],
    industries: params.industries ?? [],
    businesses: params.businesses,
    employeeBands: params.employeeBands,
    seniority: people.seniority,
    departments: people.departments,
    locationScope: params.locationScope,
    targetCompanies: AUTOPILOT_TARGET_COMPANIES,
    targetLeads: AUTOPILOT_TARGET_LEADS,
    chunkSize: AUTOPILOT_CHUNK_SIZE,
    peoplePerCompany: AUTOPILOT_PEOPLE_PER_COMPANY,
    outreachTemplate: params.outreachTemplate?.trim() || AUTOPILOT_OUTREACH_TEMPLATE,
    schedule: normalizeAutopilotSchedule(params.schedule),
    autoSend,
  };
}

export async function startAutopilotRun(params: StartAutopilotParams): Promise<AutopilotRunRow> {
  if (!params.cities?.length) {
    throw new Error("Select at least one city");
  }
  const flags = await getAgentFlags(params.workspaceId);
  if (!isAutopilotEnabled(flags)) {
    throw new Error("Autopilot is paused. Turn it on in Settings → AI.");
  }

  const runNow = params.runNow !== false;
  const run = await createAutopilotRun({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    createdByUserId: params.userId,
    input: buildAutopilotInput(params),
    status: runNow ? "queued" : "paused",
    error: runNow ? null : "Scheduled. Waiting for the next run time.",
  });

  if (runNow) {
    await enqueueAutopilotChunk({ runId: run.id, chunkIndex: 0 });
  }
  return run;
}

export async function enqueueAutopilotChunk(params: { runId: string; chunkIndex: number }): Promise<void> {
  const { inngestJobsEnabled } = await import("@/lib/jobs/enqueue");
  if (inngestJobsEnabled()) {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "autopilot/chunk.requested",
      data: params,
    });
    return;
  }
  void runAutopilotChunk(params.runId, params.chunkIndex).catch((error) => {
    console.error("[autopilot] chunk failed", params.runId, params.chunkIndex, error);
  });
}

export async function runAutopilotChunk(runId: string, chunkIndex: number): Promise<AutopilotRunRow | null> {
  const run = await getAutopilotRun(runId);
  if (!run) return null;
  if (run.status === "paused" || run.status === "failed" || run.status === "awaiting_approval") {
    return run;
  }

  const flags = await getAgentFlags(run.workspaceId);
  if (!isAutopilotEnabled(flags)) {
    return pauseAutopilotRun(runId, "Autopilot is paused.");
  }

  const input = run.input;
  const progress = run.progress;
  const chunkSize = planNextAutopilotChunk({
    targetCompanies: input.targetCompanies,
    chunkSize: input.chunkSize,
    companiesSaved: progress.companiesSaved,
    targetLeads: input.targetLeads,
    leadsSaved: progress.leadsSaved,
  });

  if (chunkSize <= 0 || progress.leadsSaved >= input.targetLeads) {
    return updateAutopilotRun(runId, {
      status: "awaiting_approval",
      completedAt: new Date(),
    });
  }

  await updateAutopilotRun(runId, {
    status: "running",
    startedAt: run.startedAt ?? new Date(),
    progress: { ...progress, chunkIndex },
    error: null,
  });

  try {
    await assertCredits(run.tenantId, "scout.company", chunkSize);
    await assertCredits(run.tenantId, "scout.contact", chunkSize);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      const decision = decideAfterAutopilotChunk({
        enabled: true,
        creditError: true,
        tavilyExhausted: false,
        companiesDiscovered: 0,
        peopleFound: 0,
        allCompaniesDeduped: false,
        leadsSavedTotal: progress.leadsSaved,
        targetLeads: input.targetLeads,
        companiesSavedTotal: progress.companiesSaved,
        targetCompanies: input.targetCompanies,
        chunkIndex,
        chunkSize: input.chunkSize,
      });
      return updateAutopilotRun(runId, {
        status: decision.nextStatus,
        error: decision.error ?? error.message,
        pausedAt: new Date(),
        progress: { ...progress, lastError: decision.error ?? error.message },
      });
    }
    throw error;
  }

  const blocked = await loadAutopilotCompanyBlocks({
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    alreadyOnThisRun: progress.companyNames,
  });

  const { getResolvedEnrichmentConfigForWorkspace } = await import(
    "@/lib/settings/workspace-settings"
  );
  const workspaceCfg = await getResolvedEnrichmentConfigForWorkspace(run.workspaceId);
  const enrichmentConfig = applyAutopilotScoutDefaults(workspaceCfg, {
    preferPlaces: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()),
  });
  let peopleConfig = enrichmentConfig;
  const dataMode = (enrichmentConfig.dataMode ?? "auto") as DataMode;

  const cityIndex = input.cities.length ? chunkIndex % input.cities.length : 0;
  const triedNames = new Set(autopilotExcludeNames(progress).map((name) => name.trim().toLowerCase()));
  for (const name of blocked.keys()) triedNames.add(name.trim().toLowerCase());
  const searchKind = input.businesses?.length && !input.industries.length ? "business" : "industry";
  const fetchSeed = chunkIndex * 7 + cityIndex;

  const collectFresh = (
    companies: ScoutCompanyResult[],
    skippedRows: { name: string; reason: string }[],
  ) => {
    const fresh: ScoutCompanyResult[] = [];
    for (const company of companies) {
      const key = company.name.trim().toLowerCase();
      const reason = blockReasonForCompany(company.name, blocked);
      if (reason) {
        skippedRows.push({ name: company.name, reason });
        triedNames.add(key);
        continue;
      }
      if (triedNames.has(key)) {
        skippedRows.push({ name: company.name, reason: "already tried on this run" });
        continue;
      }
      fresh.push(company);
    }
    return fresh;
  };

  const skipped: { name: string; reason: string }[] = [];
  const searchMessages: string[] = [];
  const attemptedThisChunk: string[] = [];
  let discoveredCount = 0;
  let discoveryPasses = 0;
  let lastPassFresh = 0;
  let tavilyDead = false;

  let peopleFound = 0;
  const newLeadIds: string[] = [];
  const newCompanyNames: string[] = [];

  const focusCityForPass = (pass: number) => {
    if (!input.cities.length) return [] as string[];
    const label = input.cities[(cityIndex + pass) % input.cities.length];
    return label ? [label] : [];
  };

  while (
    shouldFillAutopilotChunk({
      leadsSavedThisChunk: newLeadIds.length,
      chunkSize,
      discoveryPasses,
      companiesTriedThisChunk: attemptedThisChunk.length,
      tavilyDead,
    })
  ) {
    const passCity = focusCityForPass(discoveryPasses);
    const passIndustries =
      lastPassFresh === 0 && discoveryPasses > 0
        ? []
        : autopilotFocusIndustries(input.industries, chunkIndex + discoveryPasses, input.cities.length);
    const discovery = await discoverAgenticCompaniesForScout({
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      cities: passCity,
      industries: passIndustries,
      seniority: input.seniority,
      departments: input.departments,
      limit: Math.max(chunkSize * 4, 40),
      excludeNames: [...triedNames],
      excludeSavedAccounts: true,
      skipInternal: true,
      locationScope: input.locationScope,
      searchKind,
      fetchSeed: fetchSeed + discoveryPasses * 11,
      lockIndustries: true,
      agenticDataStack: enrichmentConfig.agenticDataStack,
      employeeBands: input.employeeBands,
    });
    discoveryPasses += 1;
    searchMessages.push(...discovery.errors, ...discovery.warnings);
    discoveredCount += discovery.companies.length;
    tavilyDead = isAutopilotTavilyExhausted(searchMessages);
    if (
      tavilyDead &&
      peopleConfig.peopleSearchProvider === "tavily_ai" &&
      hasApolloKey()
    ) {
      peopleConfig = { ...peopleConfig, peopleSearchProvider: "apollo" };
      searchMessages.push("Tavily people search ran out of credits. Switched to Apollo.");
      tavilyDead = false;
    }
    const freshCompanies = collectFresh(discovery.companies, skipped);
    lastPassFresh = freshCompanies.length;
    if (!freshCompanies.length) continue;
    if (tavilyDead && configUsesTavilyForCompanies(peopleConfig)) continue;

    const need = chunkSize - newLeadIds.length;
    const remainTries = Math.max(0, AUTOPILOT_MAX_TRIES_PER_CHUNK - attemptedThisChunk.length);
    const batch = freshCompanies.slice(0, Math.min(need * 3, remainTries));
    if (!batch.length) break;
    await mapWithConcurrency(batch, PEOPLE_CONCURRENCY, async (company) => {
      const latest = await getAutopilotRun(runId);
      if (!latest || latest.status === "paused" || latest.status === "failed") return;
      if (newLeadIds.length >= chunkSize) return;
      if (tavilyDead) {
        skipped.push({ name: company.name, reason: "people search paused: Tavily credits ran out" });
        return;
      }
      if (!isAutopilotEnabled(await getAgentFlags(run.workspaceId))) return;

      const key = company.name.trim().toLowerCase();
      if (triedNames.has(key)) return;
      triedNames.add(key);
      attemptedThisChunk.push(company.name);

      try {
        const peopleCities = autopilotPeopleCities(company, passCity);
        const { people, resolvedDomain, resolvedWebsite, warnings, errors } = await discoverPeople({
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          companyName: company.name,
          companyDomain: company.domain,
          companyWebsite: company.website,
          dataMode,
          config: peopleConfig,
          limit: peoplePerCompanyLimit(input.peoplePerCompany),
          seniority: input.seniority,
          departments: input.departments,
          cities: peopleCities,
          locationScope: input.locationScope,
        });
        searchMessages.push(...(warnings ?? []), ...(errors ?? []));
        if (isAutopilotTavilyExhausted(searchMessages)) {
          if (peopleConfig.peopleSearchProvider === "tavily_ai" && hasApolloKey()) {
            peopleConfig = { ...peopleConfig, peopleSearchProvider: "apollo" };
            searchMessages.push("Tavily people search ran out of credits. Switched to Apollo.");
          } else {
            tavilyDead = true;
          }
        }
        if (newLeadIds.length >= chunkSize) return;
        const keepable = people
          .filter((person: ScoutPersonResult) => person.name?.trim())
          .slice(0, peoplePerCompanyLimit(input.peoplePerCompany))
          .map((person) =>
            applyGuessedEmail(person, {
              ...company,
              domain: resolvedDomain ?? company.domain,
              website: resolvedWebsite ?? company.website,
            }),
          );
        if (!keepable.length) {
          skipped.push({
            name: company.name,
            reason: autopilotPeopleSkipReason([...(warnings ?? []), ...(errors ?? [])]),
          });
          return;
        }
        peopleFound += keepable.length;

        const saved = await saveScoutLeads({
          people: keepable,
          company: {
            ...company,
            domain: resolvedDomain ?? company.domain,
            website: resolvedWebsite ?? company.website,
          },
          dataMode,
          leadSource: AUTOPILOT_LEAD_SOURCE,
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          createdByUserId: run.createdByUserId ?? undefined,
          enrichmentConfig: peopleConfig,
          plantCities: peopleCities,
        });
        if (saved.saved.length && newLeadIds.length < chunkSize) {
          newLeadIds.push(...saved.saved.map((item) => item.leadId).slice(0, chunkSize - newLeadIds.length));
          if (!newCompanyNames.includes(company.name)) newCompanyNames.push(company.name);
        }
        for (const item of saved.skipped) {
          skipped.push({ name: `${company.name}: ${item.name}`, reason: item.reason });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        searchMessages.push(message);
        skipped.push({ name: company.name, reason: message });
      }
    });
  }

  let tavilyExhausted = isAutopilotTavilyExhausted(searchMessages);
  if (tavilyExhausted && peopleConfig.peopleSearchProvider === "apollo") {
    tavilyExhausted = false;
  }
  if (tavilyExhausted) {
    const { fetchTavilyAccountUsage } = await import("@/lib/enrichment/tavily-account");
    const { allTavilyKeysExhausted } = await import("@/lib/enrichment/tavily-usage");
    tavilyExhausted = allTavilyKeysExhausted(await fetchTavilyAccountUsage());
  }
  if (tavilyExhausted && !configUsesTavilyForCompanies(peopleConfig) && hasApolloKey()) {
    tavilyExhausted = false;
  }
  const emptyPage = attemptedThisChunk.length === 0;
  const emptyDiscoveryStreak = emptyPage ? (progress.emptyDiscoveryStreak ?? 0) + 1 : 0;
  const merged = mergeAutopilotProgress(progress, {
    chunkIndex,
    newLeadIds,
    newCompanyNames,
    newAttemptedNames: attemptedThisChunk,
    newSkipped: skipped,
    emptyDiscoveryStreak,
    lastError: tavilyExhausted
      ? "Tavily credits ran out. Autopilot paused. Add credits, then tap Continue."
      : null,
  });

  const decision = decideAfterAutopilotChunk({
    enabled: isAutopilotEnabled(await getAgentFlags(run.workspaceId)),
    tavilyExhausted,
    companiesDiscovered: discoveredCount,
    peopleFound,
    allCompaniesDeduped: discoveredCount > 0 && attemptedThisChunk.length === 0,
    leadsSavedTotal: merged.leadsSaved,
    targetLeads: input.targetLeads,
    companiesSavedTotal: merged.companiesSaved,
    targetCompanies: input.targetCompanies,
    chunkIndex,
    chunkSize: input.chunkSize,
    attemptedCount: merged.attemptedNames?.length ?? 0,
    emptyDiscoveryStreak,
    autoSend: input.autoSend,
  });

  const updated = await updateAutopilotRun(runId, {
    status: decision.nextStatus,
    progress: { ...merged, lastError: decision.error ?? merged.lastError },
    error: decision.error ?? null,
    pausedAt: decision.nextStatus === "paused" ? new Date() : undefined,
    completedAt:
      decision.nextStatus === "awaiting_approval" || decision.nextStatus === "failed"
        ? new Date()
        : undefined,
  });

  if (decision.enqueueWriter && newLeadIds.length && isAutopilotEnabled(await getAgentFlags(run.workspaceId))) {
    await enqueueWriterForLeads({
      leadIds: newLeadIds,
      tenantId: run.tenantId,
      mode: "sequence",
      outreachTemplate: input.outreachTemplate || AUTOPILOT_OUTREACH_TEMPLATE,
      batchId: `autopilot:${runId}:${chunkIndex}`,
    });
  }

  if (decision.enqueueNext && decision.nextChunkIndex !== undefined) {
    await enqueueAutopilotChunk({ runId, chunkIndex: decision.nextChunkIndex });
  }

  return updated;
}

export async function requestPauseAutopilotRun(runId: string): Promise<AutopilotRunRow> {
  return pauseAutopilotRun(runId, "Paused by you.");
}

export async function resumeAutopilotRun(runId: string): Promise<AutopilotRunRow> {
  const run = await getAutopilotRun(runId);
  if (!run) throw new Error("Autopilot run not found");
  if (run.status === "queued" || run.status === "running") return run;
  if (run.progress.leadsSaved >= run.input.targetLeads) {
    throw new Error("This run already has 100 leads.");
  }
  if (isAutopilotTavilyExhausted([run.error ?? "", run.progress.lastError ?? ""])) {
    const { getResolvedEnrichmentConfigForWorkspace } = await import(
      "@/lib/settings/workspace-settings"
    );
    const workspaceCfg = await getResolvedEnrichmentConfigForWorkspace(run.workspaceId);
    const cfg = applyAutopilotScoutDefaults(workspaceCfg, {
      preferPlaces: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()),
    });
    const needsTavily = configUsesTavilyForCompanies(cfg) || (cfg.peopleSearchProvider === "tavily_ai" && !hasApolloKey());
    if (needsTavily) {
      const { fetchTavilyAccountUsage } = await import("@/lib/enrichment/tavily-account");
      const { allTavilyKeysExhausted } = await import("@/lib/enrichment/tavily-usage");
      if (allTavilyKeysExhausted(await fetchTavilyAccountUsage())) {
        throw new Error(
          configUsesTavilyForCompanies(cfg)
            ? "Tavily keys are exhausted. Add credits, then tap Continue."
            : "Tavily people search is out of credits. Add Tavily credits or switch people search to Apollo, then tap Continue.",
        );
      }
    }
  }
  const flags = await getAgentFlags(run.workspaceId);
  if (!isAutopilotEnabled(flags)) {
    throw new Error("Autopilot is paused. Turn it on in Settings → AI.");
  }

  const nextChunkIndex = run.status === "failed" || run.status === "paused" || run.status === "awaiting_approval"
    ? run.progress.chunkIndex + 1
    : run.progress.chunkIndex;

  await updateAutopilotRun(runId, {
    status: "queued",
    error: null,
    completedAt: null,
    pausedAt: null,
    progress: { ...run.progress, lastError: null },
  });
  await enqueueAutopilotChunk({ runId, chunkIndex: nextChunkIndex });
  const next = await getAutopilotRun(runId);
  if (!next) throw new Error("Autopilot run not found");
  return next;
}

export async function updateAutopilotRunSettings(
  runId: string,
  patch: AutopilotRunSettings,
): Promise<AutopilotRunRow> {
  const run = await getAutopilotRun(runId);
  if (!run) throw new Error("Autopilot run not found");
  const cities = (patch.cities ?? run.input.cities).map((city) => city.trim()).filter(Boolean);
  if (!cities.length) throw new Error("Select at least one city");

  const people = resolveAutopilotPeopleFilters({
    seniority: patch.seniority !== undefined ? patch.seniority : run.input.seniority,
    departments: patch.departments !== undefined ? patch.departments : run.input.departments,
  });
  const input = buildAutopilotInput({
    cities,
    industries: patch.industries ?? run.input.industries,
    businesses: patch.businesses ?? run.input.businesses,
    employeeBands: patch.employeeBands ?? run.input.employeeBands,
    seniority: people.seniority,
    departments: people.departments,
    locationScope: patch.locationScope ?? run.input.locationScope,
    outreachTemplate: patch.outreachTemplate ?? run.input.outreachTemplate,
    schedule: patch.schedule ?? run.input.schedule,
    autoSend: patch.autoSend ?? run.input.autoSend,
  });

  const wasLive = run.status === "queued" || run.status === "running";
  return updateAutopilotRun(runId, {
    input,
    status: wasLive ? "paused" : run.status,
    error: wasLive ? "Updated. Autopilot paused so the next chunk uses the new filters." : run.error,
    pausedAt: wasLive ? new Date() : run.pausedAt,
  });
}

export async function removeAutopilotRun(runId: string): Promise<void> {
  const run = await getAutopilotRun(runId);
  if (!run) throw new Error("Autopilot run not found");
  if (run.status === "queued" || run.status === "running") {
    await pauseAutopilotRun(runId, "Deleted.");
  }
  const ok = await deleteAutopilotRunRow(runId);
  if (!ok) throw new Error("Autopilot run not found");
}

/** Start or resume each scheduled bot whose local time slot is due. */
export async function kickDueAutopilotRuns(now = new Date()): Promise<{
  resumed: number;
  started: number;
  skipped: number;
}> {
  const { db, workspaces } = await import("@/db");
  const rows = await db.select({ id: workspaces.id, tenantId: workspaces.tenantId }).from(workspaces);
  let resumed = 0;
  let started = 0;
  let skipped = 0;
  for (const workspace of rows) {
    if (!isAutopilotEnabled(await getAgentFlags(workspace.id))) {
      skipped += 1;
      continue;
    }
    const runs = await listAutopilotRuns({
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      limit: 50,
    });
    for (const run of runs) {
      if (!isAutopilotScheduleDue(run.input.schedule, now, run.progress.lastScheduledAt)) {
        continue;
      }
      await updateAutopilotRun(run.id, {
        progress: { ...run.progress, lastScheduledAt: now.toISOString() },
      });
      const plan = planDailyAutopilotAction([
        {
          id: run.id,
          status: run.status,
          leadsSaved: run.progress.leadsSaved,
          targetLeads: run.input.targetLeads,
        },
      ]);
      if (plan.action === "resume") {
        try {
          await resumeAutopilotRun(plan.runId);
          resumed += 1;
        } catch (error) {
          console.error("[autopilot] scheduled resume failed", plan.runId, error);
          skipped += 1;
        }
        continue;
      }
      if (plan.action === "start_new") {
        if (!run.input.cities.length) {
          skipped += 1;
          continue;
        }
        await startAutopilotRun({
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          userId: run.createdByUserId ?? undefined,
          cities: run.input.cities,
          industries: run.input.industries,
          businesses: run.input.businesses,
          employeeBands: run.input.employeeBands,
          seniority: run.input.seniority,
          departments: run.input.departments,
          locationScope: run.input.locationScope,
          outreachTemplate: run.input.outreachTemplate,
          schedule: run.input.schedule,
          autoSend: run.input.autoSend,
          runNow: true,
        });
        started += 1;
        continue;
      }
      skipped += 1;
    }
  }
  return { resumed, started, skipped };
}

/** @deprecated Use kickDueAutopilotRuns. Kept for older cron callers. */
export async function kickDailyAutopilotRuns() {
  return kickDueAutopilotRuns();
}
