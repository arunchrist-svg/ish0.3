import { NextResponse } from "next/server";
import { runReplyWriter } from "@/lib/agents/reply-writer";
import { db, leads, leadOutreach } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { toWriterDraft } from "@/lib/agents/writer-draft";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadId } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { outreachId } = await runReplyWriter(leadId);
    const draft = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    if (!draft) return NextResponse.json({ error: "Draft not found after reply write" }, { status: 500 });
    return NextResponse.json({ draft: toWriterDraft(draft) });
  } catch (e) {
    const errRes = handleApiError(e, "[api/agents/writer/reply]");
    if (errRes.status !== 500) return errRes;
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
