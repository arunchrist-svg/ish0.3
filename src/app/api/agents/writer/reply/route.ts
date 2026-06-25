import { NextResponse } from "next/server";
import { runReplyWriter } from "@/lib/agents/reply-writer";
import { db, leads } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const outreachId = await runReplyWriter(leadId);
    return NextResponse.json({ outreachId });
  } catch (e) {
    const errRes = handleApiError(e, "[api/agents/writer/reply]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
