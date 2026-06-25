import type { EmailConfig, EmailProvider } from "@/lib/email/config";

export type SendParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendResult = {
  mode: "dry_run" | "test" | "live";
  provider: EmailProvider;
  messageId?: string;
  to: string;
  subject: string;
  timestamp: string;
};

export type ProviderStatus = {
  configured: boolean;
  hint: string;
  user?: string;
};

export interface MailTransport {
  readonly name: EmailProvider;
  getStatus(config: EmailConfig): ProviderStatus;
  verify(config: EmailConfig): Promise<ProviderStatus>;
  send(params: SendParams, config: EmailConfig, to: string): Promise<SendResult>;
}
