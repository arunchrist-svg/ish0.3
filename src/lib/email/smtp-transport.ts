import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailConfig } from "@/lib/email/config";
import { formatFromAddress, resolveSmtpCredentials } from "@/lib/email/config";
import type { MailTransport, ProviderStatus, SendParams, SendResult } from "@/lib/email/types";

let _transporter: Transporter | null = null;
let _transporterKey = "";

function transporterKey(config: EmailConfig): string {
  const creds = resolveSmtpCredentials(config);
  return `${creds.host}:${creds.port}:${creds.user}:${creds.pass}`;
}

function resetTransporter() {
  _transporter = null;
  _transporterKey = "";
}

function getTransporter(config: EmailConfig): Transporter {
  const key = transporterKey(config);
  if (!_transporter || _transporterKey !== key) {
    const creds = resolveSmtpCredentials(config);
    _transporter = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
    });
    _transporterKey = key;
  }
  return _transporter;
}

function classifySmtpError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("auth") || lower.includes("credentials") || lower.includes("535")) {
    return `SMTP authentication failed — check your email and App Password: ${message}`;
  }
  if (lower.includes("connect") || lower.includes("timeout") || lower.includes("econnrefused")) {
    return `SMTP network error — check host and port: ${message}`;
  }
  return `SMTP verification failed: ${message}`;
}

export const smtpTransport: MailTransport = {
  name: "smtp",

  getStatus(config: EmailConfig): ProviderStatus {
    const creds = resolveSmtpCredentials(config);
    if (!creds.host || !creds.user || !creds.pass) {
      return {
        configured: false,
        hint: "Add your Gmail address and App Password in Settings below",
        user: creds.user || undefined,
      };
    }
    return {
      configured: true,
      hint: "SMTP credentials saved",
      user: creds.user,
    };
  },

  async verify(config: EmailConfig): Promise<ProviderStatus> {
    const status = this.getStatus(config);
    if (!status.configured) {
      return status;
    }

    try {
      await getTransporter(config).verify();
      return {
        configured: true,
        hint: `SMTP credentials verified for ${status.user}`,
        user: status.user,
      };
    } catch (err) {
      resetTransporter();
      return {
        configured: false,
        hint: classifySmtpError(err),
        user: status.user,
      };
    }
  },

  async send(params: SendParams, config: EmailConfig, to: string): Promise<SendResult> {
    const from = formatFromAddress(config);
    const replyTo = params.replyTo ?? config.replyToAddress;
    const timestamp = new Date().toISOString();

    const info = await getTransporter(config).sendMail({
      from,
      to,
      subject: params.subject,
      html: params.html,
      replyTo,
    });

    return {
      mode: config.sendMode,
      provider: "smtp",
      messageId: info.messageId,
      to,
      subject: params.subject,
      timestamp,
    };
  },
};
