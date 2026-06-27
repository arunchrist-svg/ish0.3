import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { provisionNewTenant } from "../src/lib/auth/provision";

const EMAIL = "srilaksha.ish@gmail.com";
const PASSWORD = "12345678";

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
        name: "Srilaksha",
        platformRole: "superadmin",
        mustChangePassword: false,
      })
      .returning();

    await provisionNewTenant({
      userId: user.id,
      orgName: "India Sweet House",
      workspaceName: "ISH Gifting",
      planSlug: "scale",
      slug: "india-sweet-house",
    });

    const membership = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, user.id),
    });
    if (membership) {
      await db
        .update(tenants)
        .set({
          onboardingStatus: "complete",
          onboardingStep: 5,
          demoMode: true,
          name: "India Sweet House",
          slug: "india-sweet-house",
        })
        .where(eq(tenants.id, membership.tenantId));
    }
    console.log("Created superadmin user");
  } else {
    await db
      .update(users)
      .set({ platformRole: "superadmin", passwordHash, mustChangePassword: false })
      .where(eq(users.id, user.id));
    console.log("Updated existing user to superadmin");
  }

  const membership = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.userId, user!.id),
  });
  if (membership) {
    await db.update(orgMembers).set({ role: "owner", status: "active" }).where(eq(orgMembers.id, membership.id));
  }

  console.log("Email:", normalized);
  console.log("Password:", PASSWORD);
  console.log("Role: superadmin");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
