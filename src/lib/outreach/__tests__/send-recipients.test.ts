import { describe, expect, it } from "vitest";
import { resolveSendRecipients } from "@/lib/outreach/send-recipients";

describe("resolveSendRecipients", () => {
  it("allows a manually added unverified email the user selected", () => {
    const result = resolveSendRecipients(
      {
        email: "priya.sharma@acme.com",
        emailStatus: "unverified",
        enrichmentProvider: "manual",
        enrichmentSource: "manual",
        alternateEmails: [],
      },
      ["priya.sharma@acme.com"],
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["priya.sharma@acme.com"]);
  });

  it("allows a generic mailbox the user added on the contact", () => {
    const result = resolveSendRecipients(
      {
        email: "hr@acme.com",
        emailStatus: "generic",
        enrichmentProvider: "manual",
        enrichmentSource: "manual",
        alternateEmails: [],
      },
      ["hr@acme.com"],
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["hr@acme.com"]);
  });

  it("allows a custom alternate that was not the primary guess", () => {
    const result = resolveSendRecipients(
      {
        email: "first.last@acme.com",
        emailStatus: "unverified",
        enrichmentProvider: "permutation",
        alternateEmails: [
          {
            email: "p.sharma@acme.com",
            emailStatus: "unverified",
            enrichmentProvider: "manual",
            enrichmentSource: "manual",
            pattern: "custom",
            testStatus: "saved",
          },
        ],
      },
      ["p.sharma@acme.com"],
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["p.sharma@acme.com"]);
  });

  it("still rejects addresses that are not stored on the contact", () => {
    const result = resolveSendRecipients(
      {
        email: "priya.sharma@acme.com",
        emailStatus: "unverified",
        alternateEmails: [],
      },
      ["someone.else@acme.com"],
    );
    expect(result.recipients).toEqual([]);
    expect(result.error).toBe("Email not on this contact: someone.else@acme.com");
  });

  it("blocks bounced or rejected stored addresses", () => {
    const bounced = resolveSendRecipients(
      {
        email: "old@acme.com",
        emailStatus: "bounced",
        alternateEmails: [],
      },
      ["old@acme.com"],
    );
    expect(bounced.recipients).toEqual([]);
    expect(bounced.error).toMatch(/bounced or rejected/i);

    const rejected = resolveSendRecipients(
      {
        email: "retry@acme.com",
        emailStatus: "unverified",
        alternateEmails: [
          {
            email: "retry@acme.com",
            emailStatus: "unverified",
            testStatus: "rejected",
          },
        ],
      },
      ["retry@acme.com"],
    );
    expect(rejected.recipients).toEqual([]);
    expect(rejected.error).toMatch(/bounced or rejected/i);
  });

  it("defaults to the stored manual email when none selected", () => {
    const result = resolveSendRecipients({
      email: "hr@acme.com",
      emailStatus: "generic",
      enrichmentProvider: "manual",
      alternateEmails: [],
    });
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["hr@acme.com"]);
  });
});
