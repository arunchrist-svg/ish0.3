/**
 * Create or refresh an owner invite for a real user (demoMode=false).
 *
 * Usage:
 *   npx tsx scripts/provision-owner-invite.ts arun.jpeg@gmail.com
 *   npx tsx scripts/provision-owner-invite.ts arun.jpeg@gmail.com --slug arun-jpeg --org "Arun Org"
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, ilike } from "drizzle-orm";
import { createOrgInvite } from "../src/lib/auth/invites";
import { provisionTenantShell } from "../src/lib/auth/provision";
import { normalizeTenantSlug, slugifyTenantName } from "../src/lib/auth/slug";

const PLAN = "growth";

function parseArgs() {
  const args = process.argv.slice(2);
  const email = args.find((a) => a.includes("@"));
  if (!email) {
    throw new Error("Usage: npx tsx scripts/provision-owner-invite.ts <email> [--slug slug] [--org name]");
  }
  const slugIdx = args.indexOf("--slug");
  const orgIdx = args.indexOf("--org");
  const slug = slugIdx >= 0 ? args[slugIdx + 1] : undefined;
  const orgName = orgIdx >= 0 ? args[orgIdx + 1] : undefined;
  return { email, slug, orgName };
}

function defaultSlugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "org";
  return normalizeTenantSlug(slugifyTenantName(local.replace(/\./g, " ")));
}

function defaultOrgName(email: string): string {
  const local = email.split("@")[0] ?? "User";
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function main() {
  const { email, slug: slugArg, orgName: orgArg } = parseArgs();
  const OWNER_EMAIL = email.trim().toLowerCase();
  const SLUG = slugArg ? normalizeTenantSlug(slugArg) : defaultSlugFromEmail(OWNER_EMAIL);
  const ORG_NAME = orgArg?.trim() || `${defaultOrgName(OWNER_EMAIL)} Org`;

  const { db, tenants, users, orgInvites, orgMembers, sessions, workspaces, workspaceSettings } =
    await import("../src/db");

  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, SLUG)).limit(1);

  if (!tenant) {
    const [superadmin] = await db
      .select()
      .from(users)
      .where(eq(users.platformRole, "superadmin"))
      .limit(1);
    if (!superadmin) throw new Error("No superadmin user found. Run: npm run db:seed-superadmin");

    const { tenantId } = await provisionTenantShell({
      orgName: ORG_NAME,
      workspaceName: "Main Workspace",
      planSlug: PLAN,
      slug: SLUG,
    });

    [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    await db.update(tenants).set({ demoMode: false }).where(eq(tenants.id, tenantId));
    tenant = { ...tenant!, demoMode: false };
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenant.id))
    .limit(1);

  if (!workspace) throw new Error(`Workspace not found for tenant ${tenant.slug}`);

  const [existingUser] = await db
    .select()
    .from(users)
    .where(ilike(users.email, OWNER_EMAIL))
    .limit(1);

  if (existingUser) {
    if (existingUser.platformRole === "superadmin") {
      throw new Error(`Refusing to modify superadmin account: ${OWNER_EMAIL}`);
    }

    await db.delete(sessions).where(eq(sessions.userId, existingUser.id));
    await db
      .delete(orgMembers)
      .where(and(eq(orgMembers.userId, existingUser.id), eq(orgMembers.tenantId, tenant.id)));

    const remainingMemberships = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(eq(orgMembers.userId, existingUser.id));

    if (remainingMemberships.length === 0) {
      await db.delete(users).where(eq(users.id, existingUser.id));
    }
  }

  await db
    .delete(orgInvites)
    .where(and(eq(orgInvites.tenantId, tenant.id), ilike(orgInvites.email, OWNER_EMAIL)));

  await db
    .update(tenants)
    .set({
      name: ORG_NAME,
      slug: SLUG,
      plan: PLAN,
      demoMode: false,
      onboardingStatus: "pending",
      onboardingStep: 1,
    })
    .where(eq(tenants.id, tenant.id));

  const [settingsRow] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspace.id))
    .limit(1);

  const existingConfig = (settingsRow?.enrichmentConfig ?? {}) as Record<string, unknown>;
  const { giftIntelProductCategory: _c, giftIntelCompetitorBrands: _b, ...rest } = existingConfig;
  const dataMode = typeof rest.dataMode === "string" ? rest.dataMode : "free";

  await db
    .update(workspaceSettings)
    .set({ enrichmentConfig: { dataMode }, updatedAt: new Date() })
    .where(eq(workspaceSettings.workspaceId, workspace.id));

  const [superadmin] = await db
    .select()
    .from(users)
    .where(eq(users.platformRole, "superadmin"))
    .limit(1);

  if (!superadmin) throw new Error("No superadmin user found. Run: npm run db:seed-superadmin");

  const invite = await createOrgInvite({
    tenantId: tenant.id,
    email: OWNER_EMAIL,
    role: "owner",
    invitedBy: superadmin.id,
    invitedBySuperadmin: true,
    skipSeatCheck: true,
  });

  console.log(
    JSON.stringify(
      {
        slug: SLUG,
        tenantId: tenant.id,
        orgName: ORG_NAME,
        ownerEmail: OWNER_EMAIL,
        demoMode: false,
        inviteUrl: invite.inviteUrl,
        expiresAt: invite.expiresAt.toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
