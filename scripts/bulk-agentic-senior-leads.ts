import { config } from "dotenv";
config({ path: ".env.local" });

import { runScoutBatch } from "@/lib/agents/scout";
import { getResolvedEnrichmentConfigForWorkspace } from "@/lib/settings/workspace-settings";
import { locationOptionsFromSelection } from "@/lib/geo/india";
import { db, accounts, leads } from "@/db";
import { eq, sql } from "drizzle-orm";

const WS = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";
const TENANT = "91deac0f-9013-4b11-baa3-28421e9a287c";
const USER = "3fd4bc90-9930-4a9c-8b15-f46b8ec0084f";
const TARGET = Number(process.env.BULK_LEAD_TARGET ?? 1000);
const COMPANY_LIMIT = Number(process.env.BULK_COMPANY_LIMIT ?? 25);
const PER_COMPANY = 3;
const SENIORITY = ["C-Level", "Founders", "VP", "Director"];
const EMPTY_STOP = 4;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const startCount = Number(
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.workspaceId, WS))
    )[0]?.n ?? 0,
  );
  const cfg = await getResolvedEnrichmentConfigForWorkspace(WS);
  const cities = locationOptionsFromSelection(cfg.scoutGeo)
    .map((o) => o.label)
    .filter(Boolean);
  if (!cities.length) throw new Error("No Area of Interest cities on the workspace");

  const savedNames = new Set(
    (
      await db
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.workspaceId, WS))
    )
      .map((r) => r.name.trim())
      .filter(Boolean),
  );

  const cityWindows = chunk(cities, 6);
  let savedThisRun = 0;
  let emptyBatches = 0;
  let seed = 0;
  const errors: string[] = [];

  console.log(
    JSON.stringify({
      startCount,
      target: TARGET,
      cities: cities.length,
      windows: cityWindows.length,
      stackTry: ["places_apollo", "tavily_directories"],
    }),
  );

  outer: for (let round = 0; round < Number(process.env.BULK_MAX_ROUNDS ?? 40); round++) {
    if (savedThisRun >= TARGET) break;
    const window = cityWindows[round % cityWindows.length] ?? cities;
    const stack = round < 12 ? ("places_apollo" as const) : ("tavily_directories" as const);
    const remaining = TARGET - savedThisRun;
    const result = await runScoutBatch({
      tenantId: TENANT,
      workspaceId: WS,
      userId: USER,
      cities: window,
      industries: [],
      seniority: SENIORITY,
      departments: [],
      companyLimit: COMPANY_LIMIT,
      maxCompaniesToProcess: COMPANY_LIMIT,
      leadsLimit: PER_COMPANY,
      leadTarget: Math.min(75, remaining),
      fetchSeed: seed,
      excludeNames: [...savedNames],
      locationScope: "interest",
      agenticDataStack: stack,
      lockIndustries: true,
      lockRoles: true,
    });

    savedThisRun += result.leadsSaved;
    seed += 1;
    emptyBatches = result.companiesDiscovered === 0 && result.leadsSaved === 0 ? emptyBatches + 1 : 0;
    for (const err of result.errors.slice(0, 8)) errors.push(err);
    console.log(
      JSON.stringify({
        round,
        stack,
        window,
        companies: result.companiesDiscovered,
        saved: result.leadsSaved,
        skipped: result.leadsSkipped,
        savedThisRun,
        emptyBatches,
        errorSample: result.errors.slice(0, 3),
      }),
    );

    const names = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.workspaceId, WS));
    for (const row of names) if (row.name.trim()) savedNames.add(row.name.trim());

    if (emptyBatches >= EMPTY_STOP && round >= cityWindows.length) break outer;
  }

  const endCount = Number(
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(eq(leads.workspaceId, WS))
    )[0]?.n ?? 0,
  );
  console.log(
    JSON.stringify({
      done: true,
      startCount,
      endCount,
      added: endCount - startCount,
      savedThisRun,
      uniqueErrors: [...new Set(errors)].slice(0, 12),
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
