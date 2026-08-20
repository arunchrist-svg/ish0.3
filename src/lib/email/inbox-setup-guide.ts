import type { SmtpServerId } from "@/lib/email/config";
import { SMTP_SERVER_OPTIONS } from "@/lib/email/config";

export type InboxSetupStep = { title: string; detail: string };

export function inboxSetupGuide(id: SmtpServerId): {
  id: SmtpServerId;
  label: string;
  host: string;
  steps: InboxSetupStep[];
} {
  const option = SMTP_SERVER_OPTIONS.find((o) => o.value === id) ?? SMTP_SERVER_OPTIONS[0];
  if (id === "zoho_in" || id === "zoho_com") {
    const mailUrl = id === "zoho_in" ? "https://mail.zoho.in" : "https://mail.zoho.com";
    const hostLabel = id === "zoho_in" ? "Zoho India" : "Zoho";
    return {
      id,
      label: hostLabel,
      host: option.host,
      steps: [
        {
          title: "Sign in to Zoho Mail",
          detail: `Open ${mailUrl} with the inbox that will send outreach (for example prasantmishra@indiasweethouse.in).`,
        },
        {
          title: "Create an App Password",
          detail:
            "Go to My Account → Security → App Passwords. Generate one for Mail. Copy the 12–16 character password. Do not use your normal Zoho login password.",
        },
        {
          title: "Open Nebula email settings",
          detail: "After you join, go to Settings → Email.",
        },
        {
          title: "Choose Inbox and mail host",
          detail: `Provider: Inbox. Mail host: ${hostLabel} (${option.host}, port 587).`,
        },
        {
          title: "Paste mailbox details",
          detail:
            "Zoho email: your full work address. App Password: the one you generated. From name: your real name. From email: the same work address.",
        },
        {
          title: "Verify, then Test, then Live",
          detail:
            "Click Verify. Save. Set Mode to Test and send one email to a personal inbox. If it arrives, switch Mode to Live.",
        },
      ],
    };
  }

  return {
    id: "gmail",
    label: "Gmail",
    host: option.host,
    steps: [
      {
        title: "Turn on 2-Step Verification",
        detail: "Google Account → Security → 2-Step Verification. Required before App Passwords appear.",
      },
      {
        title: "Create an App Password",
        detail: "Google Account → Security → App passwords. Create one for Mail. Copy the 16-character password.",
      },
      {
        title: "Open Nebula email settings",
        detail: "After you join, go to Settings → Email.",
      },
      {
        title: "Choose Inbox and Gmail",
        detail: "Provider: Inbox. Mail host: Gmail (smtp.gmail.com, port 587).",
      },
      {
        title: "Paste mailbox details",
        detail:
          "Gmail: your full address. App Password: the 16-character password. From name: your real name. From email: the same address.",
      },
      {
        title: "Verify, then Test, then Live",
        detail:
          "Click Verify. Save. Set Mode to Test and send one email to a personal inbox. If it arrives, switch Mode to Live.",
      },
    ],
  };
}

export function isSmtpServerId(value: unknown): value is SmtpServerId {
  return value === "gmail" || value === "zoho_in" || value === "zoho_com";
}

export function inboxSetupHtml(id: SmtpServerId): string {
  const guide = inboxSetupGuide(id);
  const items = guide.steps
    .map(
      (step, i) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;"><p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111;">${i + 1}. ${escapeHtml(step.title)}</p><p style="margin:0;font-size:13px;line-height:1.5;color:#555;">${escapeHtml(step.detail)}</p></td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
