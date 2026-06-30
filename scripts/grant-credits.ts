import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { grantCredits, getCreditBalance } from "../src/lib/billing/credits";

const EMAIL = "srilaksha.ish@gmail.com";
const AMOUNT = 1000;

async function main() {
  const { db, users, orgMembers, tenants } = await import("../src/db");

  const normalized = EMAIL.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user) {
    console.error("User not found:", EMAIL);
    process.exit(1);
  }

  const [membership] = await db
    .select({ tenantId: orgMembers.tenantId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, user.id))
    .limit(1);

  if (!membership) {
    console.error("No tenant membership for", EMAIL);
    process.exit(1);
  }

  const [tenant] = await db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, membership.tenantId))
    .limit(1);

  const before = await getCreditBalance(membership.tenantId);
  const after = await grantCredits({
    tenantId: membership.tenantId,
    amount: AMOUNT,
    action: "admin.grant",
    referenceId: `manual-grant-${Date.now()}`,
  });

  console.log("User:", EMAIL);
  console.log("Tenant:", tenant?.name, `(${tenant?.slug})`);
  console.log("Previous balance:", before);
  console.log("Granted:", AMOUNT);
  console.log("New balance:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
