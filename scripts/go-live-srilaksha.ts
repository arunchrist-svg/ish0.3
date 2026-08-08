/**
 * Take India Sweet House (Srilaksha) out of demo and enable live email send.
 *
 * Usage: npx tsx scripts/go-live-srilaksha.ts
 * Dry run: npx tsx scripts/go-live-srilaksha.ts --dry-run
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq, ilike, or } from "drizzle-orm";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const TARGET_EMAILS = ["srilaksha.ish@gmail.com", "srilaksha@gmail.com"];
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const { db, users, orgMembers, tenants, workspaces, workspaceSettings } = await import("../src/db");

  const foundUsers = [];
  for (const email of TARGET_EMAILS) {
    const [u] = await db.select().from(users).where(ilike(users.email, email)).limit(1);
    if (u) foundUsers.push(u);
  }

  // Also catch any srilaksha* variant if exact miss
  if (foundUsers.length === 0) {
    const fuzzy = await db
      .select()
      .from(users)
      .where(or(ilike(users.email, "srilaksha%"), ilike(users.email, "%srilaksha%")));
    foundUsers.push(...fuzzy);
  }

  if (foundUsers.length === 0) {
    console.error("No user found for:", TARGET_EMAILS.join(", "));
    process.exit(1);
  }

  const results = [];

  for (const user of foundUsers) {
    const memberships = await db.select().from(orgMembers).where(eq(orgMembers.userId, user.id));
    for (const m of memberships) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, m.tenantId)).limit(1);
      if (!tenant) continue;

      const before = {
        email: user.email,
        platformRole: user.platformRole,
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        demoMode: tenant.demoMode,
        onboardingStatus: tenant.onboardingStatus,
      };

      if (!DRY_RUN) {
        await db
          .update(tenants)
          .set({
            demoMode: false,
            onboardingStatus: "complete",
            onboardingStep: 5,
          })
          .where(eq(tenants.id, tenant.id));
      }

      const wsRows = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenant.id));
      const workspaceUpdates = [];

      for (const ws of wsRows) {
        const [settings] = await db
          .select()
          .from(workspaceSettings)
          .where(eq(workspaceSettings.workspaceId, ws.id))
          .limit(1);

        const existing = (settings?.emailConfig ?? {}) as Record<string, unknown>;
        const next = {
          ...existing,
          sendMode: "live" as const,
          provider: (existing.provider as string) || "smtp",
        };

        if (!DRY_RUN) {
          if (settings) {
            await db
              .update(workspaceSettings)
              .set({ emailConfig: next, updatedAt: new Date() })
              .where(eq(workspaceSettings.workspaceId, ws.id));
          } else {
            await db.insert(workspaceSettings).values({
              workspaceId: ws.id,
              emailConfig: next,
            });
          }
        }

        workspaceUpdates.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          sendModeBefore: existing.sendMode ?? null,
          sendModeAfter: next.sendMode,
          smtpUser: next.smtpUser ?? null,
          fromAddress: next.fromAddress ?? null,
          smtpPassSet: Boolean(next.smtpPass),
        });
      }

      results.push({
        ...before,
        demoModeAfter: false,
        dryRun: DRY_RUN,
        workspaces: workspaceUpdates,
      });
    }
  }

  if (!DRY_RUN) {
    invalidateEmailConfigCache();
  }

  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, results }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
