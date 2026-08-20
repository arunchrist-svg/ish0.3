import { inboxSetupGuide, inboxSetupHtml } from "@/lib/email/inbox-setup-guide";
import type { SmtpServerId } from "@/lib/email/config";

export function buildTeamInviteEmail(params: {
  tenantName: string;
  inviteUrl: string;
  role: string;
  mailHost?: SmtpServerId;
  existingUser?: boolean;
}): { subject: string; html: string } {
  const { tenantName, inviteUrl, role, mailHost, existingUser } = params;
  const cta = existingUser ? "Open Nebula and sign in" : "Accept invite and create your login";
  const lead = existingUser
    ? `You already have an account. Sign in, then connect the inbox you will send from.`
    : `Use the button below to join ${escapeHtml(tenantName)} as ${escapeHtml(role)}.`;

  const setup = mailHost
    ? `<h2 style="margin:24px 0 8px;font-size:16px;color:#111;">Set up ${escapeHtml(inboxSetupGuide(mailHost).label)} to send email</h2>
       <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#555;">Outreach sends from your own mailbox. Follow every step. You do not need domain DNS.</p>
       ${inboxSetupHtml(mailHost)}`
    : "";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f4ef;font-family:ui-sans-serif,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888;">Nebula</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#111;">Join ${escapeHtml(tenantName)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#444;">${lead}</p>
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:600;">${cta}</a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:#888;">If the button does not work, copy this link:</p>
    <p style="margin:0 0 8px;font-size:12px;word-break:break-all;color:#555;">${escapeHtml(inviteUrl)}</p>
    ${setup}
  </div>
</body></html>`;

  return {
    subject: mailHost
      ? `Join ${tenantName} and connect ${inboxSetupGuide(mailHost).label}`
      : `Join ${tenantName} on Nebula`,
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
