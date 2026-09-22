import { db, leads } from "@/db";
import { and, eq } from "drizzle-orm";
import { isHumanReplyContent } from "@/lib/email/human-reply-filter";
import { revertFalseInboundReply } from "@/lib/email/revert-false-inbound";

/** Undo leads marked Replied when last inbound copy is DSN / OOO / auto-reply. */
export async function reconcileNonHumanRepliedLeads(workspaceId: string, limit = 40): Promise<number> {
  const rows = await db
    .select({ id: leads.id, lastReplyContent: leads.lastReplyContent })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), eq(leads.status, "replied")))
    .limit(limit);

  let fixed = 0;
  for (const row of rows) {
    if (isHumanReplyContent(row.lastReplyContent)) continue;
    await revertFalseInboundReply(row.id);
    fixed++;
  }
  return fixed;
}
