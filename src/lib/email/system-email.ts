import { Resend } from "resend";
import type { EmailConfig } from "@/lib/email/config";
import { getSmtpStatus } from "@/lib/email/config";
import { smtpTransport } from "@/lib/email/smtp-transport";

export async function sendSystemEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  smtpFallback?: EmailConfig;
}): Promise<{ ok: boolean; error?: string; dryRun?: boolean; via?: "resend" | "smtp" | "dry_run" }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    const smtp = await trySmtpFallback(params);
    if (smtp) return smtp;
    console.log("[system-email:dry_run]", params.subject, params.to);
    return { ok: true, dryRun: true, via: "dry_run" };
  }

  const from = process.env.SYSTEM_EMAIL_FROM ?? "Nebula <onboarding@resend.dev>";
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    const message = error.message || JSON.stringify(error);
    console.error("[system-email]", error);
    const smtp = await trySmtpFallback(params);
    if (smtp?.ok) return smtp;
    return { ok: false, error: smtp?.error ?? message };
  }
  return { ok: true, via: "resend" };
}

async function trySmtpFallback(params: {
  to: string | string[];
  subject: string;
  html: string;
  smtpFallback?: EmailConfig;
}): Promise<{ ok: boolean; error?: string; via: "smtp" } | null> {
  if (!params.smtpFallback) return null;
  if (!getSmtpStatus(params.smtpFallback).configured) return null;
  const to = Array.isArray(params.to) ? params.to[0] : params.to;
  if (!to) return null;
  try {
    await smtpTransport.send(
      { to, subject: params.subject, html: params.html },
      params.smtpFallback,
      to,
    );
    return { ok: true, via: "smtp" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[system-email:smtp]", error);
    return { ok: false, error, via: "smtp" };
  }
}
