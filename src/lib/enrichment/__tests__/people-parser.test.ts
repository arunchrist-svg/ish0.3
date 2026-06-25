import { describe, expect, it } from "vitest";
import { parsePeopleFromSearchResults } from "@/lib/enrichment/people-parser";

describe("ENRICH-UNIT-004 people parser", () => {
  it("extracts people from LinkedIn search hits", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Priya Sharma | HR Director | LinkedIn",
          url: "https://www.linkedin.com/in/priya-sharma-hr",
          content: "HR leader at Test Corp",
        },
      ],
      5,
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Priya Sharma");
    expect(results[0].linkedIn).toContain("linkedin.com/in/priya-sharma-hr");
    expect(results[0].isKeyDM).toBe(true);
    expect(results[0].matchScore).toBeGreaterThan(50);
  });

  it("derives name from slug when title is empty", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "",
          url: "https://linkedin.com/in/vikram-patel-proc",
          content: "",
        },
      ],
      5,
    );

    expect(results[0]?.name).toBe("Vikram Patel Proc");
  });

  it("filters junk names", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "LinkedIn",
          url: "https://linkedin.com/in/login",
          content: "",
        },
      ],
      5,
    );
    expect(results).toHaveLength(0);
  });

  it("deduplicates same LinkedIn profile", () => {
    const hit = {
      title: "Arun Krishnan - Plant HR",
      url: "https://linkedin.com/in/arun-krishnan",
      content: "Also at https://linkedin.com/in/arun-krishnan",
    };
    const results = parsePeopleFromSearchResults([hit, hit], 5);
    expect(results).toHaveLength(1);
  });

  it("respects limit", () => {
    const hits = Array.from({ length: 10 }, (_, i) => ({
      title: `Person ${i} Smith | Manager`,
      url: `https://linkedin.com/in/person-${i}-smith`,
      content: "",
    }));
    expect(parsePeopleFromSearchResults(hits, 3)).toHaveLength(3);
  });

  it("marks non-DM titles with lower match score", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Alex Chen | Software Engineer",
          url: "https://linkedin.com/in/alex-chen-dev",
          content: "",
        },
      ],
      5,
    );
    expect(results[0]?.isKeyDM).toBe(false);
    expect(results[0]?.matchScore).toBe(52);
  });
});
