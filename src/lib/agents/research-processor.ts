import { db, leads, leadResearch } from "@/db";
import { eq, and, notExists } from "drizzle-orm";
import { runResearcherLite } from "@/lib/agents/researcher-lite";

export async function processPendingResearch(limit = 5): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const pending = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(
        eq(leads.status, "scouted"),
        eq(leads.researcherEligible, true),
        notExists(
          db.select({ id: leadResearch.id }).from(leadResearch).where(eq(leadResearch.leadId, leads.id)),
        ),
      ),
    )
    .limit(limit);

  let succeeded = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      await runResearcherLite(row.id);
      succeeded++;
    } catch (e) {
      console.error("[research-processor] failed for", row.id, e);
      failed++;
    }
  }

  return { attempted: pending.length, succeeded, failed };
}

export function triggerPendingResearchAsync(limit = 3): void {
  void processPendingResearch(limit).catch((e) =>
    console.error("[research-processor] batch failed", e),
  );
}
