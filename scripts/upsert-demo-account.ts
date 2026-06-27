import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { provisionNewTenant } from "../src/lib/auth/provision";

const EMAIL = "demo@demo.com";
const PASSWORD = "12345678";
const ORG_NAME = "Demo Company";
const SLUG = "demo-company";

async function main() {
  const { db, users, orgMembers, tenants } = await import("../src/db");

  const normalized = EMAIL.toLowerCase();
  const passwordHash = await hashPassword(PASSWORD);

  let [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: normalized,
        passwordHash,
        name: "Demo User",
        platformRole: "user",
        mustChangePassword: false,
      })
      .returning();
    console.log("Created user");
  } else {
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, name: "Demo User" })
      .where(eq(users.id, user.id));
    console.log("Updated existing user password");
  }

  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });

  if (!membership) {
    await provisionNewTenant({
      userId: user.id,
      orgName: ORG_NAME,
      workspaceName: "Demo Workspace",
      planSlug: "growth",
      slug: SLUG,
    });
    console.log("Created demo organization");
  }

  const updatedMembership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user.id),
  });

  if (updatedMembership) {
    await db
      .update(orgMembers)
      .set({ role: "owner", status: "active" })
      .where(eq(orgMembers.id, updatedMembership.id));

    await db
      .update(tenants)
      .set({
        name: ORG_NAME,
        slug: SLUG,
        plan: "growth",
        demoMode: true,
        onboardingStatus: "complete",
        onboardingStep: 5,
      })
      .where(eq(tenants.id, updatedMembership.tenantId));
  }

  console.log("Email:", normalized);
  console.log("Password:", PASSWORD);
  console.log("Organization:", ORG_NAME, `(${SLUG})`);
  console.log("Role: owner");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
