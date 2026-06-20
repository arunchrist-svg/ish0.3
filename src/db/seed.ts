import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import "dotenv/config";

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  console.log("Seeding ISH tenant...");

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "India Sweet House", plan: "starter" })
    .onConflictDoNothing()
    .returning();

  if (!tenant) {
    console.log("Tenant already exists, skipping.");
    return;
  }

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ tenantId: tenant.id, name: "ISH Gifting" })
    .returning();

  await db.insert(schema.campaigns).values({
    tenantId: tenant.id,
    workspaceId: workspace.id,
    name: "Diwali 2026",
    season: "diwali",
    startDate: new Date("2026-09-15"),
    endDate: new Date("2026-10-31"),
    giftingContext:
      "Diwali 2026 corporate gifting campaign. ISH offers premium pure-ghee mithai, dry fruit hampers, and gift boxes for corporates. Focus on bulk orders for 100–10,000 employees. Key hook: festival tradition, employee appreciation, premium local artisan quality.",
    targetCities: ["Bangalore", "Hosur", "Mysore", "Pune", "Chennai"],
    targetIndustries: ["IT", "Manufacturing", "Real Estate", "Pharma", "Retail", "BFSI"],
    cadenceDays: [4, 8, 14],
    isActive: true,
  });

  console.log("Seed complete. Tenant ID:", tenant.id);
}

seed().catch(console.error);
