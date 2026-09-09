import { config } from "dotenv";
config({ path: ".env.local" });

import { ilike, or } from "drizzle-orm";
import { db, tenants } from "../src/db";
import { fixLeadNamesForTenants } from "../src/lib/leads/fix-names";

async function main() {
  const ishTenants = await db
    .select()
    .from(tenants)
    .where(
      or(
        ilike(tenants.name, "%sweet house%"),
        ilike(tenants.name, "%ish%"),
        ilike(tenants.slug, "%ish%"),
        ilike(tenants.slug, "%sweet%"),
      ),
    );

  const tenantList = ishTenants.length ? ishTenants : await db.select().from(tenants);
  console.log(
    "tenants",
    tenantList.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  );

  const result = await fixLeadNamesForTenants(tenantList.map((t) => t.id));
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
