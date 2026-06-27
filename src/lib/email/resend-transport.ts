import { Resend } from "resend";
import type { EmailConfig } from "@/lib/email/config";
import { formatFromAddress, getResendStatus } from "@/lib/email/config";
import { htmlToPlainText } from "@/lib/email/plain-text";
import type { MailTransport, ProviderStatus, SendParams, SendResult } from "@/lib/email/types";

const resendClients = new Map<string, Resend>();

function getResend(apiKey?: string): Resend {
  const key = apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("Resend API key not configured");
  let client = resendClients.get(key);
  if (!client) {
    client = new Resend(key);
    resendClients.set(key, client);
  }
  return client;
}

export const resendTransport: MailTransport = {
  name: "resend",

  getStatus(config: EmailConfig): ProviderStatus {
    const key = config.resendApiKey?.trim() || process.env.RESEND_API_KEY?.trim();
    return key ? { configured: true, hint: "Resend API key set" } : getResendStatus();
  },

  async verify(config: EmailConfig): Promise<ProviderStatus> {
    return this.getStatus(config);
  },

  async send(params: SendParams, config: EmailConfig, to: string): Promise<SendResult> {
    const from = formatFromAddress(config);
    const replyTo = params.replyTo ?? config.replyToAddress;
    const timestamp = new Date().toISOString();

    const resend = getResend(config.resendApiKey);
    const text = params.text ?? htmlToPlainText(params.html);
    const headers: Record<string, string> = {};
    if (params.messageId) headers["Message-ID"] = params.messageId;
    if (params.inReplyTo) headers["In-Reply-To"] = params.inReplyTo;
    if (params.references) headers["References"] = params.references;
    if (config.emailStyle === "marketing" && replyTo) {
      headers["List-Unsubscribe"] = `<mailto:${replyTo}?subject=unsubscribe>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: params.subject,
      html: params.html,
      text,
      replyTo,
      headers,
    });

    if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);

    return {
      mode: config.sendMode,
      provider: "resend",
      messageId: params.messageId ?? data?.id,
      to,
      subject: params.subject,
      timestamp,
    };
  },
};
