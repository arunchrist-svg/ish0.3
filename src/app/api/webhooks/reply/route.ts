import { NextResponse } from "next/server";
import { db, leads, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isPastReplyStage } from "@/lib/pipeline-status";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, source = "webhook" } = body;

    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    if (isPastReplyStage(lead.status)) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already past reply stage" });
    }

    await db.update(leads).set({ status: "replied" }).where(eq(leads.id, leadId));
    await db.insert(yieldFunnel).values({
      leadId,
      stage: "replied",
      metadata: { source },
    });

    await logAudit({
      action: "lead.replied",
      entityType: "lead",
      entityId: leadId,
      metadata: { source },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/webhooks/reply]", e);
    return NextResponse.json({ error: "Reply update failed" }, { status: 500 });
  }
}
