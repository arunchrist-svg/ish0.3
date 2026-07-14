/**
 * Full reset for a real owner invite (demoMode=false).
 * Revokes prior invites, removes partial signup state, and issues a fresh owner invite.
 *
 * Usage: npx tsx scripts/reset-demo-gmail-invite.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, ilike } from "drizzle-orm";
import { createOrgInvite } from "../src/lib/auth/invites";
import { provisionTenantShell } from "../src/lib/auth/provision";

const OWNER_EMAIL = "demo@gmail.com";
const ORG_NAME = "Demo Gmail Org";
const SLUG = "demo-gmail";
const PLAN = "growth";

type ResetAction =
  | "tenant_created"
  | "tenant_reset"
  | "user_removed"
  | "membership_removed"
  | "sessions_cleared"
  | "invites_revoked"
  | "workspace_settings_cleared"
  | "invite_created";

async function main() {
  const { db, tenants, users, orgInvites, orgMembers, sessions, workspaces, workspaceSettings } =
    await import("../src/db");

  const actions: ResetAction[] = [];

  let [tenant] = await db.select().from(tenants).where(eq(tenants.slug, SLUG)).limit(1);

  if (!tenant) {
    const [superadmin] = await db
      .select()
      .from(users)
      .where(eq(users.platformRole, "superadmin"))
      .limit(1);
    if (!superadmin) {
      throw new Error("No superadmin user found. Run: npm run db:seed-superadmin");
    }

    const { tenantId } = await provisionTenantShell({
      orgName: ORG_NAME,
      workspaceName: "Main Workspace",
      planSlug: PLAN,
      slug: SLUG,
    });

    [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    actions.push("tenant_created");
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenant.id))
    .limit(1);

  if (!workspace) {
    throw new Error(`Workspace not found for tenant ${tenant.slug}`);
  }

  const normalizedEmail = OWNER_EMAIL.toLowerCase();
  const [existingUser] = await db
    .select()
    .from(users)
    .where(ilike(users.email, normalizedEmail))
    .limit(1);

  if (existingUser) {
    if (existingUser.platformRole === "superadmin") {
      throw new Error(`Refusing to delete superadmin account: ${OWNER_EMAIL}`);
    }

    await db.delete(sessions).where(eq(sessions.userId, existingUser.id));
    actions.push("sessions_cleared");

    await db
      .delete(orgMembers)
      .where(and(eq(orgMembers.userId, existingUser.id), eq(orgMembers.tenantId, tenant.id)));
    actions.push("membership_removed");

    const remainingMemberships = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(eq(orgMembers.userId, existingUser.id));

    if (remainingMemberships.length === 0) {
      await db.delete(users).where(eq(users.id, existingUser.id));
      actions.push("user_removed");
    }
  }

  const revoked = await db
    .delete(orgInvites)
    .where(and(eq(orgInvites.tenantId, tenant.id), ilike(orgInvites.email, normalizedEmail)))
    .returning({ id: orgInvites.id });

  if (revoked.length > 0) {
    actions.push("invites_revoked");
  }

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
  actions.push("tenant_reset");

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
    .set({
      enrichmentConfig: { dataMode },
      updatedAt: new Date(),
    })
    .where(eq(workspaceSettings.workspaceId, workspace.id));
  actions.push("workspace_settings_cleared");

  const [superadmin] = await db
    .select()
    .from(users)
    .where(eq(users.platformRole, "superadmin"))
    .limit(1);

  if (!superadmin) {
    throw new Error("No superadmin user found. Run: npm run db:seed-superadmin");
  }

  const invite = await createOrgInvite({
    tenantId: tenant.id,
    email: OWNER_EMAIL,
    role: "owner",
    invitedBy: superadmin.id,
    invitedBySuperadmin: true,
    skipSeatCheck: true,
  });
  actions.push("invite_created");

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
        resetActions: actions,
        invitesRevoked: revoked.length,
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
