import type { EmailConfig } from "@/lib/email/config";

export function repliesCapability(config: Pick<EmailConfig, "provider">): {
  supported: boolean;
  hint: string;
} {
  if (config.provider === "smtp") {
    return {
      supported: true,
      hint: "Replies are matched from this inbox over IMAP.",
    };
  }
  return {
    supported: true,
    hint: "Replies are matched from Resend Receiving. Sync replies, or point the email.received webhook at this app.",
  };
}
