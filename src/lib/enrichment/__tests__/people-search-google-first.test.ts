import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  geminiGroundedSearch: vi.fn(),
  searchWeb: vi.fn(async () => []),
  callLLM: vi.fn(),
}));

vi.mock("@/lib/enrichment/web-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/enrichment/web-search")>();
  return {
    ...actual,
    geminiGroundedSearch: mocks.geminiGroundedSearch,
    searchWeb: mocks.searchWeb,
    canSearchPeopleOnWeb: () => true,
  };
});

vi.mock("@/lib/llm", () => ({
  callLLM: (...args: unknown[]) => mocks.callLLM(...args),
}));

vi.mock("@/lib/enrichment/company-site-pages", () => ({
  fetchCompanyLeadershipPages: async () => [],
}));

import { searchPeopleViaWeb } from "@/lib/enrichment/people-search";

describe("searchPeopleViaWeb Google-first", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test");
    mocks.geminiGroundedSearch.mockReset();
    mocks.searchWeb.mockReset();
    mocks.searchWeb.mockResolvedValue([]);
    mocks.callLLM.mockReset();
    mocks.callLLM.mockResolvedValue(
      JSON.stringify([
        {
          name: "Namitha A",
          title: "Head of Human Resources Operations at Knovatic Solutions",
          department: "HR",
          linkedIn: null,
          location: null,
          bio: "Head of Human Resources Operations at Knovatic Solutions.",
        },
      ]),
    );
    mocks.geminiGroundedSearch.mockResolvedValue([
      {
        title: "Knovatic Solutions head hr",
        url: "https://www.google.com/search?q=Knovatic%20Solutions%20head%20hr",
        content:
          "Namitha A is the Head of Human Resources Operations at Knovatic Solutions. The company's core leadership team also includes Vivek Venkateshappa.",
      },
    ]);
  });

  it("extracts Head of HR from a Google overview without Tavily LinkedIn pages", async () => {
    const people = await searchPeopleViaWeb({
      companyName: "Knovatic Solutions",
      roleHints: ["Head of HR", "HR Director"],
      limit: 1,
    });

    expect(mocks.geminiGroundedSearch).toHaveBeenCalledWith("Knovatic Solutions head hr", 8);
    expect(people.some((person) => /namitha/i.test(person.name))).toBe(true);
    expect(people[0]?.title).toMatch(/human resources|head of hr/i);
    const tavilyPeoplePages = mocks.searchWeb.mock.calls.filter(([query]) => {
      const q = String(query);
      if (/namitha|open to work|#opentowork/i.test(q)) return false;
      return /site:linkedin\.com/i.test(q) && /Knovatic/i.test(q);
    });
    expect(tavilyPeoplePages).toHaveLength(0);
    expect(mocks.geminiGroundedSearch).toHaveBeenCalledTimes(1);
  });
});
