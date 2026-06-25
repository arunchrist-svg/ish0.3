import { NextResponse } from "next/server";
import type { EmailConfig } from "@/lib/email/config";
import { verifyEmailConnection } from "@/lib/settings/email-settings";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<EmailConfig>;
    const config = await verifyEmailConnection(body);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    console.error("[api/settings/email/verify] POST failed:", e);
    return NextResponse.json({ error: "Failed to verify SMTP connection" }, { status: 500 });
  }
}
