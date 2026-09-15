import { describe, expect, it } from "vitest";
import { llmPersonSupportedBySearchHits } from "@/lib/enrichment/people-search";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

function person(partial: Partial<ScoutPersonResult> & { name: string }): ScoutPersonResult {
  return {
    title: null,
    department: null,
    email: null,
    linkedIn: null,
    location: null,
    bio: null,
    matchScore: 50,
    isKeyDM: true,
    dataSource: "test",
    ...partial,
  };
}

describe("llmPersonSupportedBySearchHits", () => {
  const hits = [
    {
      title: "Priya Sharma | HR Director at Infosys | LinkedIn",
      url: "https://www.linkedin.com/in/priya-sharma-hr",
      content: "HR Director at Infosys, Bengaluru",
    },
  ];

  it("keeps a person named in a company search hit", () => {
    expect(
      llmPersonSupportedBySearchHits(
        person({ name: "Priya Sharma", title: "HR Director at Infosys" }),
        hits,
        ["Infosys"],
      ),
    ).toBe(true);
  });

  it("drops an invented person with no supporting URL or snippet", () => {
    expect(
      llmPersonSupportedBySearchHits(
        person({
          name: "Ghost User",
          linkedIn: "https://www.linkedin.com/in/ghost-user-xyz",
          title: "Consultant",
          bio: "Independent advisor.",
        }),
        hits,
        ["Infosys"],
      ),
    ).toBe(false);
  });
});
