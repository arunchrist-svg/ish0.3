import { db, leads } from "@/db";
import { eq } from "drizzle-orm";
import { resetLeadOutreach } from "@/lib/outreach/reset-lead-outreach";
import {
  occasionIdFromTags,
  replaceOccasionTag,
  type WriteOccasionId,
} from "@/lib/occasions/catalog";

const SENT_STATUSES = new Set(["outreached", "replied", "closed_won", "closed_lost"]);

export async function prepareLeadForOccasionWrite(
  leadId: string,
  occasionId: WriteOccasionId,
): Promise<void> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return;
  const previous = occasionIdFromTags(lead.tags as string[] | null);
  if (previous && previous !== occasionId && SENT_STATUSES.has(lead.status)) {
    await resetLeadOutreach(leadId);
  }
  const tags = replaceOccasionTag((lead.tags as string[]) ?? [], occasionId);
  await db.update(leads).set({ tags, updatedAt: new Date() }).where(eq(leads.id, leadId));
}
