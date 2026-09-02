import { eq } from "drizzle-orm";
import { db, leads } from "@/db";
import { canAccessLeadRecord } from "@/lib/leads/lead-visibility";
import type { AgentToolContext } from "./types";

export async function requireAccessibleLead(
  context: AgentToolContext,
  leadId: string,
): Promise<typeof leads.$inferSelect> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (
    !lead ||
    lead.workspaceId !== context.ctx.workspaceId ||
    !canAccessLeadRecord(context.ctx, lead)
  ) {
    throw new Error("Lead not found or inaccessible");
  }
  return lead;
}
