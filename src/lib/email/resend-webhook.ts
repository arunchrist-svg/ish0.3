import { createHmac, timingSafeEqual } from "crypto";

export type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    bounce?: {
      message?: string;
      type?: string;
      subType?: string;
    };
    failed?: {
      reason?: string;
    };
  };
};

export function isBounceLikeEvent(type?: string): boolean {
  return type === "email.bounced" || type === "email.failed" || type === "email.complained";
}

export function bounceMetaFromEvent(event: ResendWebhookEvent): {
  bounceType: string;
  bounceReason: string;
} {
  if (event.type === "email.complained") {
    return { bounceType: "Complaint", bounceReason: "Recipient marked the email as spam" };
  }
  if (event.type === "email.failed") {
    return {
      bounceType: "Failed",
      bounceReason: event.data?.failed?.reason?.trim() || "Provider failed to deliver",
    };
  }
  return {
    bounceType: event.data?.bounce?.type?.trim() || "Permanent",
    bounceReason:
      event.data?.bounce?.message?.trim() ||
      event.data?.bounce?.subType?.trim() ||
      "Mailbox rejected the email",
  };
}

export function shouldPauseSequenceForBounce(bounceType: string): boolean {
  return bounceType.toLowerCase() !== "temporary";
}

/** Verify a Resend/Svix webhook signature. */
export function verifyResendWebhook(params: {
  rawBody: string;
  svixId?: string | null;
  svixTimestamp?: string | null;
  svixSignature?: string | null;
  secret: string;
  nowMs?: number;
}): ResendWebhookEvent {
  const { rawBody, secret } = params;
  const svixId = params.svixId?.trim();
  const svixTimestamp = params.svixTimestamp?.trim();
  const svixSignature = params.svixSignature?.trim();
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing webhook signature headers");
  }

  const nowMs = params.nowMs ?? Date.now();
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 60 * 5) {
    throw new Error("Webhook timestamp is stale");
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest("base64");

  const candidates = svixSignature
    .split(" ")
    .map((part) => {
      const value = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
      return value.trim();
    })
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  const ok = candidates.some((candidate) => {
    const got = Buffer.from(candidate);
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
  if (!ok) throw new Error("Invalid webhook signature");

  return JSON.parse(rawBody) as ResendWebhookEvent;
}
