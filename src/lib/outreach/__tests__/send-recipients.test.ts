import { describe, expect, it } from "vitest";
import {
  defaultReplyRecipientEmails,
  defaultSelectedContactEmails,
  EMPTY_SEND_TO_HINT,
  isWeakGuessEmail,
  lastOutboundRecipientEmail,
  preferredSendRecipientEmails,
  retainSelectedRecipientEmails,
  resolveSendRecipients,
  reusesThreadRecipient,
  selectedEmailsForSend,
} from "@/lib/outreach/send-recipients";

describe("resolveSendRecipients", () => {
  it("skips firstname@ guesses when picking a default To", () => {
    expect(
      defaultSelectedContactEmails("umarani@bfwindia.com", [
        {
          email: "umarani@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          enrichmentSource: "name_domain_guess:first",
          pattern: "first",
        },
        {
          email: "umarani.n@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "manual",
          enrichmentSource: "manual",
          pattern: "custom",
        },
      ]),
    ).toEqual(["umarani.n@bfwindia.com"]);
  });

  it("prefers first.last over a firstname@ guess", () => {
    expect(
      preferredSendRecipientEmails([
        {
          email: "umarani@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          pattern: "first",
        },
        {
          email: "umarani.n@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          pattern: "first.last",
        },
      ]),
    ).toEqual(["umarani.n@bfwindia.com"]);
  });

  it("does not auto-select a lone firstname@ guess", () => {
    expect(
      defaultSelectedContactEmails("firstname@bfwindia.com", [
        {
          email: "firstname@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "permutation",
          pattern: "first",
        },
      ]),
    ).toEqual([]);
    expect(
      isWeakGuessEmail({ email: "firstname@bfwindia.com", pattern: "first" }),
    ).toBe(true);
    expect(
      preferredSendRecipientEmails([
        {
          email: "firstname@bfwindia.com",
          emailStatus: "unverified",
          pattern: "first",
        },
      ]),
    ).toEqual([]);
  });

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

  it("accepts a valid address the user selected even if not stored yet", () => {
    const result = resolveSendRecipients(
      {
        email: "priya.sharma@acme.com",
        emailStatus: "unverified",
        alternateEmails: [],
      },
      ["emmanuel.sureshkumar@automotiveaxles.com"],
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["emmanuel.sureshkumar@automotiveaxles.com"]);
    expect(result.persistEmails).toEqual(["emmanuel.sureshkumar@automotiveaxles.com"]);
  });

  it("allows a first.last guess shown from the company domain", () => {
    const result = resolveSendRecipients(
      {
        email: "e.sureshkumar@automotiveaxles.com",
        emailStatus: "unverified",
        enrichmentProvider: "manual",
        enrichmentSource: "manual",
        firstName: "Emmanuel",
        lastName: "Sureshkumar",
        alternateEmails: [],
      },
      ["emmanuel.sureshkumar@automotiveaxles.com"],
      {
        firstName: "Emmanuel",
        lastName: "Sureshkumar",
        domain: "automotiveaxles.com",
        companyName: "Automotive Axles",
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["emmanuel.sureshkumar@automotiveaxles.com"]);
  });

  it("still rejects malformed requested addresses", () => {
    const result = resolveSendRecipients(
      {
        email: "priya.sharma@acme.com",
        emailStatus: "unverified",
        alternateEmails: [],
      },
      ["not-an-email"],
    );
    expect(result.recipients).toEqual([]);
    expect(result.error).toBe("Invalid email address: not-an-email");
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

  it("does not auto-select a firstname@ permutation guess", () => {
    const result = resolveSendRecipients({
      email: "umarani@bfwindia.com",
      emailStatus: "unverified",
      enrichmentProvider: "permutation",
      enrichmentSource: "name_domain_guess:first",
      alternateEmails: [
        {
          email: "umarani.n@bfwindia.com",
          emailStatus: "unverified",
          enrichmentProvider: "manual",
          enrichmentSource: "manual",
          pattern: "custom",
          testStatus: "saved",
        },
      ],
    });
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["umarani.n@bfwindia.com"]);
  });

  it("does not default-send a literal firstname@ placeholder", () => {
    const result = resolveSendRecipients({
      email: "firstname@bfwindia.com",
      emailStatus: "unverified",
      enrichmentProvider: "permutation",
      enrichmentSource: "name_domain_guess:first",
      alternateEmails: [],
    });
    expect(result.recipients).toEqual([]);
    expect(result.error).toBe(EMPTY_SEND_TO_HINT);
  });

  it("keeps an explicit firstname@ pick and a typed extra inbox", () => {
    expect(
      retainSelectedRecipientEmails(
        ["umarani@bfwindia.com", "sales@bfwindia.com"],
        ["umarani@bfwindia.com"],
        new Set(),
        [],
      ),
    ).toEqual(["umarani@bfwindia.com", "sales@bfwindia.com"]);
  });

  it("falls back to a real inbox when To was empty", () => {
    expect(
      retainSelectedRecipientEmails([], ["umarani@bfwindia.com", "umarani.n@bfwindia.com"], new Set(), [
        "umarani.n@bfwindia.com",
      ]),
    ).toEqual(["umarani.n@bfwindia.com"]);
  });

  it("drops already-sent addresses unless allowAlreadySent (replies)", () => {
    expect(
      retainSelectedRecipientEmails(
        ["ops@acme.com"],
        ["ops@acme.com"],
        new Set(["ops@acme.com"]),
        ["ops@acme.com"],
      ),
    ).toEqual([]);
    expect(
      retainSelectedRecipientEmails(
        ["ops@acme.com"],
        ["ops@acme.com"],
        new Set(["ops@acme.com"]),
        ["ops@acme.com"],
        { allowAlreadySent: true },
      ),
    ).toEqual(["ops@acme.com"]);
  });

  it("keeps the original To for a reply even when that inbox already received Email 1", () => {
    expect(
      selectedEmailsForSend(["ops@acme.com"], new Set(["ops@acme.com"]), "reply"),
    ).toEqual(["ops@acme.com"]);
    expect(
      selectedEmailsForSend(["ops@acme.com"], new Set(["ops@acme.com"]), "outbound"),
    ).toEqual([]);
  });

  it("keeps the original To for sequence follow-ups (Email 2/3), same as reply", () => {
    expect(
      selectedEmailsForSend(["ops@acme.com"], new Set(["ops@acme.com"]), "follow_up"),
    ).toEqual(["ops@acme.com"]);
    expect(
      retainSelectedRecipientEmails(
        ["ops@acme.com"],
        ["ops@acme.com"],
        new Set(["ops@acme.com"]),
        ["ops@acme.com"],
        { allowAlreadySent: true },
      ),
    ).toEqual(["ops@acme.com"]);
    expect(
      defaultReplyRecipientEmails("other@acme.com", [], "ops@acme.com"),
    ).toEqual(["ops@acme.com"]);
    expect(reusesThreadRecipient("follow_up")).toBe(true);
    expect(reusesThreadRecipient("reply")).toBe(true);
    expect(reusesThreadRecipient("outbound")).toBe(false);
  });

  it("defaults a reply To to the last outbound address, including a weak guess already used", () => {
    expect(
      lastOutboundRecipientEmail(
        [
          { kind: "initial", status: "sent", recipientEmail: "firstname@bfwindia.com" },
          { kind: "inbound_reply", status: "sent", recipientEmail: "firstname@bfwindia.com" },
        ],
        [{ kind: "sent", recipientEmail: "firstname@bfwindia.com" }],
      ),
    ).toBe("firstname@bfwindia.com");
    expect(
      defaultReplyRecipientEmails("other@bfwindia.com", [], "firstname@bfwindia.com"),
    ).toEqual(["firstname@bfwindia.com"]);
  });

  it("still sends firstname@ when the user explicitly selected it", () => {
    const result = resolveSendRecipients(
      {
        email: "umarani@bfwindia.com",
        emailStatus: "unverified",
        enrichmentProvider: "permutation",
        enrichmentSource: "name_domain_guess:first",
        alternateEmails: [],
      },
      ["umarani@bfwindia.com"],
    );
    expect(result.error).toBeUndefined();
    expect(result.recipients).toEqual(["umarani@bfwindia.com"]);
  });
});
