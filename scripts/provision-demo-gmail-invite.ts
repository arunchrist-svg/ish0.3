import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq, ilike } from "drizzle-orm";
import { provisionTenantShell } from "../src/lib/auth/provision";
import { createOrgInvite } from "../src/lib/auth/invites";

const OWNER_EMAIL = "demo@gmail.com";
const ORG_NAME = "Demo Gmail Org";
const SLUG = "demo-gmail";
const PLAN = "growth";

async function main() {
  const { db, tenants, users, orgInvites } = await import("../src/db");

  const existing = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, SLUG))
    .limit(1);

  if (existing.length > 0) {
    const tenant = existing[0];
    const [pending] = await db
      .select()
      .from(orgInvites)
      .where(ilike(orgInvites.email, OWNER_EMAIL))
      .limit(1);

    if (pending) {
      const { buildInviteUrl } = await import("../src/lib/auth/invites");
      console.log(
        JSON.stringify(
          {
            slug: tenant.slug,
            tenantId: tenant.id,
            orgName: tenant.name,
            ownerEmail: OWNER_EMAIL,
            inviteUrl: buildInviteUrl(pending.token),
            expiresAt: pending.expiresAt.toISOString(),
            note: "Reused existing tenant and invite",
          },
          null,
          2,
        ),
      );
      return;
    }

    throw new Error(`Tenant slug "${SLUG}" exists but no invite for ${OWNER_EMAIL}`);
  }

  const [superadmin] = await db
    .select()
    .from(users)
    .where(eq(users.platformRole, "superadmin"))
    .limit(1);

  if (!superadmin) {
    throw new Error("No superadmin user found. Run: npm run db:seed-superadmin");
  }

  const { tenantId, slug } = await provisionTenantShell({
    orgName: ORG_NAME,
    workspaceName: "Main Workspace",
    planSlug: PLAN,
    slug: SLUG,
  });

  const invite = await createOrgInvite({
    tenantId,
    email: OWNER_EMAIL,
    role: "owner",
    invitedBy: superadmin.id,
    invitedBySuperadmin: true,
    skipSeatCheck: true,
  });

  console.log(
    JSON.stringify(
      {
        slug,
        tenantId,
        orgName: ORG_NAME,
        ownerEmail: OWNER_EMAIL,
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
