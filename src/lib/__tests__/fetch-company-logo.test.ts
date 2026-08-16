import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearCompanyLogoCache,
  distinctiveLogoTokens,
  resolveCompanyLogoUrl,
  wikiTitleFitsCompany,
} from "@/lib/fetch-company-logo";

afterEach(() => {
  clearCompanyLogoCache();
  vi.unstubAllGlobals();
});

describe("wikiTitleFitsCompany", () => {
  it("accepts a brand page for a similarly named subsidiary", () => {
    expect(wikiTitleFitsCompany("Tata Electronics", "Tata Semiconductor Private Limited")).toBe(true);
    expect(wikiTitleFitsCompany("Terex", "TEREX INDIA PRIVATE LIMITED")).toBe(true);
  });

  it("rejects unrelated Wikipedia hits", () => {
    expect(wikiTitleFitsCompany("Energy", "Copral Energy")).toBe(false);
    expect(wikiTitleFitsCompany("Pavan", "Pavan Chandu Enterprises")).toBe(false);
  });
});

describe("distinctiveLogoTokens", () => {
  it("keeps the brand and drops legal suffixes", () => {
    expect(distinctiveLogoTokens("TEREX INDIA PRIVATE LIMITED")).toEqual(["terex"]);
    expect(distinctiveLogoTokens("Pavan Chandu Enterprises")).toEqual(["pavan", "chandu"]);
  });
});

describe("resolveCompanyLogoUrl", () => {
  it("returns a Wikipedia thumbnail when the page matches the company", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          query: {
            pages: {
              "1": {
                title: "Terex",
                thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/t/t0/Terex_logo.png" },
              },
            },
          },
        }),
      }),
    );

    await expect(resolveCompanyLogoUrl({ name: "TEREX INDIA PRIVATE LIMITED" })).resolves.toBe(
      "https://upload.wikimedia.org/wikipedia/commons/t/t0/Terex_logo.png",
    );
  });

  it("skips unmatched Wikipedia results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            "1": { title: "Energy", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/e.png" } },
          },
        },
        Heading: "Energy",
        Image: "",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveCompanyLogoUrl({ name: "Copral Energy" })).resolves.toBeUndefined();
  });
});
