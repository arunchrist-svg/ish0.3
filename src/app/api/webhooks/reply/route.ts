import { NextResponse } from "next/server";
import { processLeadReply } from "@/lib/email/process-reply";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leadId, source = "webhook", replyContent, inboundMessageId } = body as {
      leadId: string;
      source?: string;
      replyContent?: string;
      inboundMessageId?: string;
    };

    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const result = await processLeadReply({ leadId, source, replyContent, inboundMessageId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/webhooks/reply]", e);
    return NextResponse.json({ error: "Reply update failed" }, { status: 500 });
  }
}
