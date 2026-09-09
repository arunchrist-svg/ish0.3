import { describe, expect, it, vi, afterEach } from "vitest";
import {
  clearWebsiteProbeCache,
  probeCompanyWebsiteLive,
  rejectNonIndianWebsiteStamp,
  websiteTextLooksForeignOnly,
  websiteTextLooksIndian,
} from "@/lib/enrichment/website-probe";

describe("probeCompanyWebsiteLive", () => {
  afterEach(() => {
    clearWebsiteProbeCache();
    vi.unstubAllGlobals();
  });

  it("marks HTTP 410 Gone as dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 410 })),
    );
    await expect(probeCompanyWebsiteLive("cinemax.co.in")).resolves.toBe("dead");
  });

  it("marks HTTP 403 and 404 as dead for scout websites", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );
    await expect(probeCompanyWebsiteLive("skypeoplefruitjuice.com")).resolves.toBe("dead");

    clearWebsiteProbeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    await expect(probeCompanyWebsiteLive("broken.example")).resolves.toBe("dead");
  });

  it("treats directory and wixsite hosts as dead without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeCompanyWebsiteLive("mandya.idbf.in")).resolves.toBe("dead");
    await expect(probeCompanyWebsiteLive("sarathitrisha.wixsite.com")).resolves.toBe("dead");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks 2xx hosts as live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    await expect(probeCompanyWebsiteLive("calderys.com")).resolves.toBe("live");
  });

  it("treats timeouts as unknown rather than dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    await expect(probeCompanyWebsiteLive("slow.example")).resolves.toBe("unknown");
  });
});

describe("India website stamps", () => {
  it("keeps Indian copy and drops US-only homepages", () => {
    expect(websiteTextLooksIndian("Based in Bengaluru, India. GSTIN 29AAAAA0000A1Z5")).toBe(true);
    expect(
      websiteTextLooksForeignOnly("Early Stage is a venture firm in New York, United States."),
    ).toBe(true);
    expect(
      rejectNonIndianWebsiteStamp({
        host: "earlystage.com",
        companyName: "EARLYSTAGE MARKETING PRIVATE LIMITED",
        snippet: "We invest in startups from our New York office in the United States. ".repeat(8),
      }),
    ).toBe(true);
    expect(
      rejectNonIndianWebsiteStamp({
        host: "early.partners",
        companyName: "EARLYSTAGE MARKETING PRIVATE LIMITED",
        snippet: "We're building a company of the best start-up marketers for hire in India, from Bengaluru.",
      }),
    ).toBe(false);
    expect(
      rejectNonIndianWebsiteStamp({
        host: "pavna.in",
        companyName: "Pavna Industries",
        snippet: "Welcome to our factory",
      }),
    ).toBe(false);
  });
});
