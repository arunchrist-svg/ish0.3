/**
 * Point ISH workspace at Hosur scouting + srilakshaenterprises.in sender (interim while corporate inbox is blocked).
 *
 * Usage:
 *   npx tsx scripts/configure-srilaksha-hosur.ts --list
 *   npx tsx scripts/configure-srilaksha-hosur.ts --slug=india-sweet-house --dry-run
 *   npx tsx scripts/configure-srilaksha-hosur.ts --slug=india-sweet-house
 *
 * Env overrides:
 *   SRILAKSHA_FROM_EMAIL (default srilaksha@srilakshaenterprises.in)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq } from "drizzle-orm";
import { db, tenants, workspaces, workspaceSettings, users, orgMembers, userEmailSettings } from "../src/db";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";
import { resolveEmailConfig } from "../src/lib/email/config";
import { resolveAreaOfFocusFromCatalog } from "../src/lib/geo/area-of-focus";
import { normalizeScoutGeo, resolveScoutLabel } from "../src/lib/geo/india";
import type { EnrichmentConfig } from "../src/lib/enrichment/config";
import { getEnrichmentConfig, lockScoutToAgenticAi, resolveEnrichmentConfig } from "../src/lib/enrichment/config";
import { persistWorkspaceEmailConfig } from "../src/lib/settings/email-settings";
import { unsealEmailSecrets } from "../src/lib/email/secret-crypto";

import { SRILAKSHA_OUTREACH_EMAIL } from "../src/lib/email/srilaksha-sender";

const DEFAULT_FROM = process.env.SRILAKSHA_FROM_EMAIL?.trim() || SRILAKSHA_OUTREACH_EMAIL;
const DEFAULT_FROM_NAME = "Srilaksha";
const DEFAULT_BRANCH = "Hosur";

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

function hosurScoutEnrichment(): Partial<EnrichmentConfig> {
  const hosur = resolveScoutLabel("Hosur");
  const districtId = hosur?.kind === "district" ? hosur.district.id : "TN-krishnagiri";
  const scoutGeo = normalizeScoutGeo({
    entireIndia: false,
    regionIds: [],
    stateIds: [],
    districtIds: [districtId],
  });

  const sipcot =
    resolveAreaOfFocusFromCatalog({
      city: "Hosur",
      query: "SIPCOT Hosur",
      radiusKm: 15,
    }) ??
    resolveAreaOfFocusFromCatalog({
      city: "Hosur",
      query: "Hosur",
      radiusKm: 15,
    });

  const scoutAreasOfFocus = sipcot ? [sipcot] : [];

  return {
    scoutGeo,
    scoutAreasOfFocus,
    scoutAreaOfFocus: scoutAreasOfFocus[0] ?? null,
    searchProvider: "agentic_ai",
    aiOperatingMode: "agentic",
  };
}

async function listTenants() {
  return db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
    })
    .from(tenants)
    .innerJoin(workspaces, eq(workspaces.tenantId, tenants.id));
}

async function main() {
  const listOnly = process.argv.includes("--list");
  const dryRun = process.argv.includes("--dry-run");
  const slug = argValue("--slug") ?? "india-sweet-house";
  const fromEmail = argValue("--from") ?? DEFAULT_FROM;

  const rows = await listTenants();
  if (listOnly) {
    for (const r of rows) {
      console.log(`${r.slug}\t${r.name}\tworkspace=${r.workspaceId}\tleads workspace ${r.workspaceName}`);
    }
    return;
  }

  const match = rows.find((r) => r.slug === slug);
  if (!match) {
    console.error(`No tenant with slug "${slug}". Run with --list.`);
    process.exit(1);
  }

  const workspaceId = match.workspaceId;
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const existingEnrichment = (settings?.enrichmentConfig ?? {}) as Partial<EnrichmentConfig>;
  const scoutPatch = hosurScoutEnrichment();
  const mergedEnrichment = lockScoutToAgenticAi(
    resolveEnrichmentConfig(existingEnrichment.dataMode ?? getEnrichmentConfig().dataMode, {
      ...existingEnrichment,
      ...scoutPatch,
    }),
  );

  const existingEmailRaw = (settings?.emailConfig ?? {}) as Record<string, unknown>;
  const existingEmail = resolveEmailConfig(unsealEmailSecrets(existingEmailRaw as never));
  const mergedEmail = resolveEmailConfig({
    ...existingEmail,
    fromAddress: fromEmail,
    fromName: existingEmail.fromName?.trim() ? existingEmail.fromName : DEFAULT_FROM_NAME,
    fromLocation: DEFAULT_BRANCH,
    outreachPaused: true,
    sendMode: existingEmail.sendMode === "live" ? "test" : existingEmail.sendMode,
  });

  console.log(`Tenant: ${match.name} (${slug})`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`From: ${mergedEmail.fromName} <${mergedEmail.fromAddress}> · branch ${mergedEmail.fromLocation}`);
  console.log(`Sending: paused=${mergedEmail.outreachPaused} mode=${mergedEmail.sendMode}`);
  console.log(
    `Scout districts: ${mergedEnrichment.scoutGeo?.districtIds?.join(", ") || "(none)"} · focus: ${
      mergedEnrichment.scoutAreasOfFocus?.map((f) => f.areaName).join(", ") || "(none)"
    }`,
  );

  if (dryRun) {
    console.log("\nDry run — no DB writes.");
    return;
  }

  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      enrichmentConfig: mergedEnrichment,
      emailConfig: existingEmailRaw,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        enrichmentConfig: mergedEnrichment,
        updatedAt: new Date(),
      },
    });

  await persistWorkspaceEmailConfig(mergedEmail, workspaceId);

  const owner = await db
    .select({ userId: orgMembers.userId, email: users.email })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.tenantId, match.tenantId))
    .limit(5);

  for (const row of owner) {
    if (!row.email?.toLowerCase().includes("srilaksha")) continue;
    const [userRow] = await db
      .select()
      .from(userEmailSettings)
      .where(and(eq(userEmailSettings.workspaceId, workspaceId), eq(userEmailSettings.userId, row.userId)))
      .limit(1);
    const userExisting = userRow?.emailConfig
      ? resolveEmailConfig(unsealEmailSecrets(userRow.emailConfig as never))
      : {};
    const userMerged = resolveEmailConfig({
      ...userExisting,
      fromAddress: fromEmail,
      fromName: userExisting.fromName?.trim() || DEFAULT_FROM_NAME,
      fromLocation: DEFAULT_BRANCH,
    });
    const { sealEmailSecrets } = await import("../src/lib/email/secret-crypto");
    await db
      .insert(userEmailSettings)
      .values({
        workspaceId,
        userId: row.userId,
        emailConfig: sealEmailSecrets(userMerged),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userEmailSettings.workspaceId, userEmailSettings.userId],
        set: { emailConfig: sealEmailSecrets(userMerged), updatedAt: new Date() },
      });
    console.log(`Updated user mailbox overlay: ${row.email}`);
  }

  invalidateEmailConfigCache();
  console.log("\nDone. In the app: verify Zoho/SMTP for the new address, scout Hosur, then resume sending when IT is ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
