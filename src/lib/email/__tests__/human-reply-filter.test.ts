import { describe, expect, it } from "vitest";
import { isHumanReplyContent, isHumanReplyNotification } from "@/lib/email/human-reply-filter";

describe("human-reply-filter", () => {
  it("rejects mail delivery software DSN copy", () => {
    expect(
      isHumanReplyContent(
        "This message was created automatically by mail delivery software. A message that you sent could not be delivered to one or more recipients.",
      ),
    ).toBe(false);
  });

  it("filters reply_received notifications that quote DSN text", () => {
    expect(
      isHumanReplyNotification({
        type: "reply_received",
        body: `They said: "This message was created automatically by mail delivery software. A message that you sent could not be delivered to one". Write your reply.`,
      }),
    ).toBe(false);
  });

  it("allows normal reply notifications", () => {
    expect(
      isHumanReplyNotification({
        type: "reply_received",
        body: `They said: "Thanks, please share pricing for 200 boxes.". Review your AI draft.`,
      }),
    ).toBe(true);
  });
});
