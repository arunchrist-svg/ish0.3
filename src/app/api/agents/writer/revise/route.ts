import { NextResponse } from "next/server";
import { reviseWriter } from "@/lib/agents/writer-revise";
import { friendlyLLMError } from "@/lib/llm";

export async function POST(req: Request) {
  try {
    const { leadOutreachId, message } = await req.json();
    if (!leadOutreachId) {
      return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    }
    if (!message?.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const result = await reviseWriter(leadOutreachId, message.trim());
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/agents/writer/revise]", e);
    return NextResponse.json({ error: friendlyLLMError(e) }, { status: 500 });
  }
}
