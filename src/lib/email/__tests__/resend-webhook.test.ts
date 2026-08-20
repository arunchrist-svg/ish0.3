import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  bounceMetaFromEvent,
  isBounceLikeLastEvent,
  shouldPauseSequenceForBounce,
  verifyResendWebhook,
} from "@/lib/email/resend-webhook";

function sign(rawBody: string, id: string, timestamp: string, secret: string) {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return `v1,${signature}`;
}

describe("verifyResendWebhook", () => {
  const secret = `whsec_${Buffer.from("webhook-secret-bytes").toString("base64")}`;
  const rawBody = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid Svix signature", () => {
    const event = verifyResendWebhook({
      rawBody,
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: sign(rawBody, id, timestamp, secret),
      secret,
    });
    expect(event.type).toBe("email.bounced");
  });

  it("rejects a bad signature", () => {
    expect(() =>
      verifyResendWebhook({
        rawBody,
        svixId: id,
        svixTimestamp: timestamp,
        svixSignature: "v1,not-valid",
        secret,
      }),
    ).toThrow(/Invalid webhook signature/);
  });
});

describe("bounce metadata", () => {
  it("pauses on permanent bounces and complaints, not temporary", () => {
    expect(shouldPauseSequenceForBounce("Permanent")).toBe(true);
    expect(shouldPauseSequenceForBounce("Complaint")).toBe(true);
    expect(shouldPauseSequenceForBounce("Temporary")).toBe(false);
  });

  it("reads bounce copy from the Resend payload", () => {
    expect(
      bounceMetaFromEvent({
        type: "email.bounced",
        data: { bounce: { type: "Permanent", message: "Mailbox does not exist" } },
      }),
    ).toEqual({ bounceType: "Permanent", bounceReason: "Mailbox does not exist" });
  });

  it("treats Resend last_event bounce states as bounced", () => {
    expect(isBounceLikeLastEvent("bounced")).toBe(true);
    expect(isBounceLikeLastEvent("delivered")).toBe(false);
  });
});
