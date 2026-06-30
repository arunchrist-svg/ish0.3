import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db, leadOutreach, leads } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { outreachId, rating, comment } = await req.json();
    if (!outreachId || !["up", "down"].includes(rating)) {
      return NextResponse.json({ error: "outreachId and rating (up|down) required" }, { status: 400 });
    }

    const outreach = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    if (!outreach) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lead = await db.query.leads.findFirst({ where: eq(leads.id, outreach.leadId) });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db
      .update(leadOutreach)
      .set({
        draftFeedback: { rating, comment: comment ?? undefined, at: new Date().toISOString() },
      })
      .where(eq(leadOutreach.id, outreachId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/outreach/feedback", err);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
