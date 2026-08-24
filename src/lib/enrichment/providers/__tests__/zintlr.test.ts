import { afterEach, describe, expect, it, vi } from "vitest";
import { zintlrEnrichProvider } from "@/lib/enrichment/providers/zintlr";

describe("zintlr enrich provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubKeys() {
    vi.stubEnv("ZINTLR_ACCESS_TOKEN", "test-token");
    vi.stubEnv("ZINTLR_SECRET_KEY", "test-secret");
  }

  it("unlocks a WhatsApp-able mobile from a person LinkedIn URL", async () => {
    stubKeys();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { phone: ["+91 98450 12345"] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await zintlrEnrichProvider.enrich({
      name: "Priya Sharma",
      company: "Test Corp",
      linkedinUrl: "https://www.linkedin.com/in/priya-sharma",
    });

    expect(result?.contact.phone).toBe("9845012345");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain("/ln-url-to-ph-email/");
    expect(JSON.parse(init.body)).toMatchObject({
      ln_url: "https://www.linkedin.com/in/priya-sharma",
      phone_unlock: true,
      email_unlock: true,
    });
    expect(init.headers["Access-Token"]).toBe("test-token");
  });

  it("unlocks email from LinkedIn when Prospeo-style providers miss", async () => {
    stubKeys();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          phone: ["+91 98450 12345"],
          email: ["priya.sharma@testcorp.in"],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await zintlrEnrichProvider.enrich({
      name: "Priya Sharma",
      company: "Test Corp",
      linkedinUrl: "https://www.linkedin.com/in/priya-sharma",
    });

    expect(result?.contact.email).toBe("priya.sharma@testcorp.in");
    expect(result?.contact.phone).toBe("9845012345");
  });

  it("falls back to email-to-phone when LinkedIn is missing", async () => {
    stubKeys();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ "priya.sharma@testcorp.in": ["9845012345"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await zintlrEnrichProvider.enrich({
      name: "Priya Sharma",
      company: "Test Corp",
      email: "priya.sharma@testcorp.in",
    });

    expect(result?.contact.phone).toBe("9845012345");
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain("/email-to-phone/");
    expect(JSON.parse(init.body)).toEqual({ emails: ["priya.sharma@testcorp.in"] });
  });

  it("skips when there is no person LinkedIn URL or email", async () => {
    stubKeys();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await zintlrEnrichProvider.enrich({
      name: "Priya Sharma",
      company: "Test Corp",
      linkedinUrl: "https://www.linkedin.com/company/test-corp",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects landlines and junk numbers", async () => {
    stubKeys();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ phone: ["2222334455", "1234567890"] }),
      }),
    );

    const result = await zintlrEnrichProvider.enrich({
      name: "Priya Sharma",
      company: "Test Corp",
      linkedinUrl: "linkedin.com/in/priya-sharma",
    });

    expect(result).toBeNull();
  });
});
