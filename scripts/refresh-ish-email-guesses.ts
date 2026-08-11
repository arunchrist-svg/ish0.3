import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, or, ilike } from "drizzle-orm";
import { db, tenants, contacts, accounts } from "../src/db";
import { refreshPermutationEmails } from "../src/lib/enrichment/contact-emails";
import type { ContactEmailEntry } from "../src/lib/enrichment/contact-emails";

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

  const tenantList = ishTenants.length
    ? ishTenants
    : await db.select().from(tenants);

  console.log(
    "tenants",
    tenantList.map((tenant) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug })),
  );

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const tenant of tenantList) {
    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        emailStatus: contacts.emailStatus,
        enrichmentProvider: contacts.enrichmentProvider,
        enrichmentSource: contacts.enrichmentSource,
        alternateEmails: contacts.alternateEmails,
        company: accounts.name,
        domain: accounts.domain,
        website: accounts.website,
      })
      .from(contacts)
      .innerJoin(accounts, eq(accounts.id, contacts.accountId))
      .where(eq(contacts.tenantId, tenant.id));

    for (const row of rows) {
      const next = refreshPermutationEmails({
        firstName: row.firstName,
        lastName: row.lastName,
        name: row.name,
        domain: row.domain,
        website: row.website,
        companyName: row.company,
        primaryEmail: row.email,
        emailStatus: row.emailStatus,
        enrichmentProvider: row.enrichmentProvider,
        enrichmentSource: row.enrichmentSource,
        alternateEmails: (row.alternateEmails as ContactEmailEntry[] | null) ?? [],
      });

      const prevEmail = row.email?.trim() || null;
      const prevAlts = JSON.stringify(row.alternateEmails ?? []);
      const nextAlts = JSON.stringify(next.alternateEmails);
      if (
        prevEmail === next.email &&
        (row.emailStatus ?? "missing") === next.emailStatus &&
        prevAlts === nextAlts
      ) {
        unchanged += 1;
        continue;
      }

      if (!next.email && next.alternateEmails.length === 0) {
        skipped += 1;
      }

      await db
        .update(contacts)
        .set({
          email: next.email,
          emailStatus: next.emailStatus,
          enrichmentProvider: next.enrichmentProvider,
          enrichmentSource: next.enrichmentSource,
          alternateEmails: next.alternateEmails,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, row.id));
      updated += 1;
      console.log(`${row.name} @ ${row.company}: ${prevEmail ?? "(none)"} -> ${next.email ?? "(none)"}`);
    }
  }

  console.log(JSON.stringify({ updated, unchanged, skipped }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
