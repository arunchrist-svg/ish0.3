import { NextResponse } from "next/server";
import { runWriter } from "@/lib/agents/writer";
import { db, leadOutreach } from "@/db";
import { eq } from "drizzle-orm";
import { friendlyLLMError } from "@/lib/llm";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";

export async function POST(req: Request) {
  try {
    const { leadId, outreachTemplate } = await req.json();
    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const template = getOutreachTemplate(outreachTemplate as OutreachTemplateId | undefined);
    const outreachId = await runWriter(leadId, { outreachTemplate: template.id });

    const draft = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, outreachId),
    });

    return NextResponse.json({ draft });
  } catch (e) {
    console.error("[api/agents/writer/run]", e);
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
