import { NextResponse } from "next/server";
import { runWriter } from "@/lib/agents/writer";
import { db, leadOutreach } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { toWriterDraft } from "@/lib/agents/writer-draft";

export async function POST(req: Request) {
  try {
    const { leadId, outreachTemplate } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const template = getOutreachTemplate(outreachTemplate as OutreachTemplateId | undefined);
    const outreachId = await runWriter(leadId, { outreachTemplate: template.id });

    const draft = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, outreachId),
    });

    if (!draft) return NextResponse.json({ error: "Draft not found after write" }, { status: 500 });

    return NextResponse.json({ draft: toWriterDraft(draft) });
  } catch (e) {
    console.error("[api/agents/writer/run]", e);
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
