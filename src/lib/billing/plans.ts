import { db, plans } from "@/db";
import { eq, asc } from "drizzle-orm";

export async function listPlans() {
  return db.select().from(plans).orderBy(asc(plans.priceCents));
}

export async function getPlanBySlug(slug: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
  return plan ?? null;
}
