import { describe, expect, it } from "vitest";
import { classifyReplyIntent, extractPriorCta } from "@/lib/email/reply-intent";

describe("classifyReplyIntent", () => {
  const sampleCta = "Would you be open to receiving a complimentary Diwali tasting sample?";

  it("classifies Sure as affirmative with sample agreement", () => {
    expect(classifyReplyIntent("Sure", sampleCta)).toEqual({
      intent: "affirmative",
      agreedTo: "sample",
    });
  });

  it("classifies Yes please as affirmative", () => {
    expect(classifyReplyIntent("Yes please", sampleCta).intent).toBe("affirmative");
  });

  it("classifies not interested as negative", () => {
    expect(classifyReplyIntent("Not interested", sampleCta).intent).toBe("negative");
  });

  it("classifies pricing question as question", () => {
    expect(classifyReplyIntent("What are your prices?", sampleCta).intent).toBe("question");
  });
});

describe("extractPriorCta", () => {
  it("extracts the last question from email body", () => {
    const body = `Hi Priya,

We help with Diwali gifting for your team.

Would you be open to receiving a complimentary Diwali tasting sample?

No worries if timing is off.

Sri`;
    expect(extractPriorCta(body)).toBe(
      "Would you be open to receiving a complimentary Diwali tasting sample?",
    );
  });
});
