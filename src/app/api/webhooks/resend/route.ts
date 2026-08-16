import { NextResponse } from "next/server";
import { processResendBounceEvent } from "@/lib/email/process-bounce";
import { processResendInboundEvent } from "@/lib/email/process-inbound";
import { isBounceLikeEvent, isInboundLikeEvent, verifyResendWebhook } from "@/lib/email/resend-webhook";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[api/webhooks/resend] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  try {
    const event = verifyResendWebhook({
      rawBody,
      svixId: req.headers.get("svix-id"),
      svixTimestamp: req.headers.get("svix-timestamp"),
      svixSignature: req.headers.get("svix-signature"),
      secret,
    });

    if (isInboundLikeEvent(event.type)) {
      const result = await processResendInboundEvent(event);
      return NextResponse.json(result);
    }

    if (!isBounceLikeEvent(event.type)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const result = await processResendBounceEvent(event);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    if (message.includes("signature") || message.includes("timestamp") || message.includes("Missing")) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    console.error("[api/webhooks/resend]", error);
    return NextResponse.json({ error: "Bounce update failed" }, { status: 500 });
  }
}
