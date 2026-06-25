import { NextResponse } from "next/server";
import { db, leads, yieldFunnel, outreachSchedule } from "@/db";
import { eq, and } from "drizzle-orm";
import { isPastReplyStage } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, source = "webhook", replyContent } = body as {
      leadId: string;
      source?: string;
      replyContent?: string;
    };

    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (isPastReplyStage(lead.status)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already past reply stage" });
    }

    // Store reply content and update lead status
    await db
      .update(leads)
      .set({
        status: "replied",
        ...(replyContent ? { lastReplyContent: replyContent } : {}),
      })
      .where(eq(leads.id, leadId));

    await db.insert(yieldFunnel).values({
      leadId,
      stage: "replied",
      metadata: { source, hasReplyContent: !!replyContent },
    });

    // Cancel all pending follow-ups for this lead
    await db
      .update(outreachSchedule)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(outreachSchedule.leadId, leadId),
          eq(outreachSchedule.status, "scheduled"),
        ),
      )
      .returning();

    await logAudit({
      action: "lead.replied",
      entityType: "lead",
      entityId: leadId,
      metadata: { source, cancelledFollowUps: -1, hasReplyContent: !!replyContent },
    });

    // Fire reply-writer in background if we have reply content
    if (replyContent) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3002}`;
      fetch(`${appUrl}/api/agents/writer/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      }).catch((e) => console.error("[reply webhook] reply-writer trigger failed", e));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/webhooks/reply]", e);
    return NextResponse.json({ error: "Reply update failed" }, { status: 500 });
  }
}
