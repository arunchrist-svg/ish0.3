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
    hint: "Replies arrive through the Resend inbound webhook. Point inbound mail on your sending domain at Resend.",
  };
}
