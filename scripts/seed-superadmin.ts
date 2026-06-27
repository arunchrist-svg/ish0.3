import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { hashPassword } from "../src/lib/auth/password";
import { provisionNewTenant } from "../src/lib/auth/provision";

const SUPERADMIN_EMAIL = "srilaksha.ish@gmail.com";
const TEMP_PASSWORD = process.env.SUPERADMIN_TEMP_PASSWORD ?? "ISH-Demo-2026!";

async function main() {
  const { db, users, orgMembers } = await import("../src/db");

  const normalized = SUPERADMIN_EMAIL.toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);

  if (!user) {
    const passwordHash = await hashPassword(TEMP_PASSWORD);
    [user] = await db
      .insert(users)
      .values({
        email: normalized,
        passwordHash,
        name: "Srilaksha",
        platformRole: "superadmin",
      })
      .returning();
    console.log("Created superadmin user:", normalized);
    console.log("Temporary password:", TEMP_PASSWORD);

    await provisionNewTenant({
      userId: user.id,
      orgName: "India Sweet House",
      workspaceName: "ISH Gifting",
      planSlug: "scale",
    });

    await db
      .update(users)
      .set({ platformRole: "superadmin" })
      .where(eq(users.id, user.id));

    const { tenants } = await import("../src/db");
    const membership = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, user.id),
    });
    if (membership) {
      await db
        .update(tenants)
        .set({ onboardingStatus: "complete", onboardingStep: 5, demoMode: true, name: "India Sweet House", slug: "india-sweet-house" })
        .where(eq(tenants.id, membership.tenantId));
    }
  } else {
    await db.update(users).set({ platformRole: "superadmin" }).where(eq(users.id, user.id));
    console.log("Promoted existing user to superadmin:", normalized);
  }

  const membership = await db.query.orgMembers.findFirst({ where: eq(orgMembers.userId, user.id) });
  if (membership) {
    await db.update(orgMembers).set({ role: "owner" }).where(eq(orgMembers.id, membership.id));
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
