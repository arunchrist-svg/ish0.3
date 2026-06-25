import { Resend } from "resend";

export async function sendSystemEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.log("[system-email:dry_run]", params.subject, params.to);
    return;
  }

  const from = process.env.SYSTEM_EMAIL_FROM ?? "ISH Sales <onboarding@resend.dev>";
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) console.error("[system-email]", error);
}
