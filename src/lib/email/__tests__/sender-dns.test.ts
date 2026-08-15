import { describe, expect, it, vi, beforeEach } from "vitest";
import * as dns from "dns";
import {
  checkDomainAuth,
  isPersonalInboxDomain,
  parseDmarcRecord,
  parseSpfRecord,
  summarizeDomainAuth,
} from "@/lib/email/sender-dns";

describe("isPersonalInboxDomain", () => {
  it("detects common personal providers", () => {
    expect(isPersonalInboxDomain("user@gmail.com")).toBe(true);
    expect(isPersonalInboxDomain("user@company.com")).toBe(false);
  });
});

describe("parseSpfRecord", () => {
  it("accepts soft-fail all", () => {
    const r = parseSpfRecord("v=spf1 include:_spf.google.com ~all");
    expect(r.valid).toBe(true);
    expect(r.allMechanism).toBe("~all");
    expect(r.warning).toBeNull();
  });

  it("rejects +all", () => {
    const r = parseSpfRecord("v=spf1 +all");
    expect(r.valid).toBe(false);
    expect(r.allMechanism).toBe("+all");
    expect(r.warning).toContain("+all");
  });

  it("warns when all mechanism missing", () => {
    const r = parseSpfRecord("v=spf1 include:sendgrid.net");
    expect(r.valid).toBe(true);
    expect(r.warning).toContain("all mechanism");
  });
});

describe("parseDmarcRecord", () => {
  it("parses reject with rua", () => {
    const r = parseDmarcRecord("v=DMARC1; p=reject; rua=mailto:dmarc@acme.com");
    expect(r.valid).toBe(true);
    expect(r.policy).toBe("reject");
    expect(r.hasRua).toBe(true);
    expect(r.warning).toBeNull();
  });

  it("warns on p=none and missing rua", () => {
    const r = parseDmarcRecord("v=DMARC1; p=none");
    expect(r.valid).toBe(true);
    expect(r.warning).toContain("none");
    expect(r.warning).toContain("rua");
  });
});

describe("checkDomainAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips DNS for personal inbox providers", async () => {
    const spy = vi.spyOn(dns.promises, "resolveTxt");
    const result = await checkDomainAuth("seller@gmail.com");
    expect(result.status).toBe("unsupported");
    expect(result.label).toContain("Personal email provider");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns pass when SPF, DMARC, and DKIM are found", async () => {
    vi.spyOn(dns.promises, "resolveTxt").mockImplementation(async (host: string) => {
      if (host === "acme.com") return [["v=spf1 include:_spf.google.com ~all"]];
      if (host === "_dmarc.acme.com") return [["v=DMARC1; p=reject; rua=mailto:dmarc@acme.com"]];
      if (host === "google._domainkey.acme.com") return [["v=DKIM1; k=rsa; p=abc"]];
      throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    });

    const result = await checkDomainAuth("hello@acme.com");
    expect(result.status).toBe("pass");
    expect(result.passCount).toBe(3);
    expect(result.checks.dmarc.policy).toBe("reject");
    expect(summarizeDomainAuth(result)).toContain("PASS");
  });

  it("warns on DMARC policy none", async () => {
    vi.spyOn(dns.promises, "resolveTxt").mockImplementation(async (host: string) => {
      if (host === "acme.com") return [["v=spf1 ~all"]];
      if (host === "_dmarc.acme.com") return [["v=DMARC1; p=none"]];
      throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    });

    const result = await checkDomainAuth("acme.com");
    expect(result.checks.dmarc.valid).toBe(true);
    expect(result.checks.dmarc.warning).toContain("none");
  });

  it("fails SPF with +all", async () => {
    vi.spyOn(dns.promises, "resolveTxt").mockImplementation(async (host: string) => {
      if (host === "bad.com") return [["v=spf1 +all"]];
      if (host === "_dmarc.bad.com") return [["v=DMARC1; p=reject; rua=mailto:x@bad.com"]];
      throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    });

    const result = await checkDomainAuth("mail@bad.com");
    expect(result.checks.spf.valid).toBe(false);
    expect(result.status).not.toBe("pass");
  });
});
