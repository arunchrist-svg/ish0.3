import { db, leadOutreach, leads } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function fetchRecentSubjectsForWorkspace(workspaceId: string, limit = 20): Promise<string[]> {
  const rows = await db
    .select({ subjectA: leadOutreach.subjectA })
    .from(leadOutreach)
    .innerJoin(leads, eq(leadOutreach.leadId, leads.id))
    .where(eq(leads.workspaceId, workspaceId))
    .orderBy(desc(leadOutreach.createdAt))
    .limit(limit);

  return rows.map((r) => r.subjectA).filter(Boolean) as string[];
}
