import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export type SendParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendResult = {
  mode: "dry_run" | "test" | "live";
  messageId?: string;
  to: string;
  subject: string;
  timestamp: string;
};

export async function sendEmail(params: SendParams): Promise<SendResult> {
  const mode = (process.env.EMAIL_SEND_MODE ?? "dry_run") as "dry_run" | "test" | "live";
  const from = process.env.EMAIL_FROM ?? "ISH Gifting <onboarding@resend.dev>";
  const timestamp = new Date().toISOString();

  if (mode === "dry_run") {
    console.log("[email:dry_run]", { to: params.to, subject: params.subject });
    return { mode, to: params.to, subject: params.subject, timestamp };
  }

  const to = mode === "test"
    ? (process.env.RESEND_TEST_RECIPIENT ?? params.to)
    : params.to;

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: params.subject,
    html: params.html,
    replyTo: params.replyTo,
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);

  return { mode, messageId: data?.id, to, subject: params.subject, timestamp };
}
