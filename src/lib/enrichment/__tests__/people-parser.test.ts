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

  it("drops people whose title names a different employer", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Sandeep Yadav | Plant Head Tata Steel(Hosur) | LinkedIn",
          url: "https://www.linkedin.com/in/sandeep-yadav-hosur",
          content: "Plant Head Tata Steel(Hosur)",
        },
      ],
      5,
      "web_heuristic",
      "Hosur Steel Industries",
    );
    expect(results).toHaveLength(0);
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
    expect(results[0]?.matchScore).toBe(23);
  });

  it("drops Team Lead and Open to Work LinkedIn hits", () => {
    expect(
      parsePeopleFromSearchResults(
        [
          {
            title: "Kiran Rao | HR Team Lead at Titan Company | LinkedIn",
            url: "https://www.linkedin.com/in/kiran-rao-hr",
            content: "HR Team Lead at Titan Company, Hosur",
          },
        ],
        5,
        "web_heuristic",
        "Titan Company",
      ),
    ).toHaveLength(0);
    expect(
      parsePeopleFromSearchResults(
        [
          {
            title: "Meera Iyer | HR Director at Titan Company | Open to Work | LinkedIn",
            url: "https://www.linkedin.com/in/meera-iyer-open",
            content: "#OpenToWork  Looking for new opportunities after Titan Company.",
          },
        ],
        5,
        "web_heuristic",
        "Titan Company",
      ),
    ).toHaveLength(0);
  });

  it("does not keep Karthi P from a company page when LinkedIn says Open to Work", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Karthi P | Human Resources Manager at Autosense Private Limited | LinkedIn",
          url: "https://www.linkedin.com/in/karthi-p-autosense",
          content: "Human Resources Manager at Autosense Private Limited Ltd",
        },
        {
          title: "Karthi P - Open to Work | LinkedIn",
          url: "https://www.linkedin.com/in/karthi-p-autosense",
          content: "Open to work. Previously Human Resources Manager at Autosense.",
        },
      ],
      5,
      "web_heuristic",
      "Autosense Private Limited",
    );
    expect(results).toHaveLength(0);
  });

  it("drops a Purchase Manager whose snippet text contains #OPENTOWORK", () => {
    const results = parsePeopleFromSearchResults(
      [
        {
          title: "Pandiyarajan S | Purchase Manager | LinkedIn",
          url: "https://www.linkedin.com/in/pandiyarajan-s",
          content: "Purchase Manager at Test Corp. Madurai, Tamil Nadu, India. #OPENTOWORK",
        },
      ],
      5,
      "web_heuristic",
      "Test Corp",
    );
    expect(results).toHaveLength(0);
  });

  // Photo-ring profiles keep a clean headline; only the merged denylist hit exposes them.
  it("drops a clean-headline person when a denylist hit for the same profile says #OPENTOWORK", () => {
    const cleanHit = {
      title: "Manikandan R | HR Executive | LinkedIn",
      url: "https://www.linkedin.com/in/manikandan-r-123",
      content: "HR - Executive - Talent Acquisition at Test Corp. Chennai, Tamil Nadu, India.",
    };
    expect(
      parsePeopleFromSearchResults([cleanHit], 5, "web_heuristic", "Test Corp"),
    ).toHaveLength(1);

    const withDenylist = parsePeopleFromSearchResults(
      [
        cleanHit,
        {
          title: "Manikandan R - Open to Work",
          url: "https://www.linkedin.com/in/manikandan-r-123",
          content: "#OPENTOWORK seeking new opportunities in HR",
        },
      ],
      5,
      "web_heuristic",
      "Test Corp",
    );
    expect(withDenylist).toHaveLength(0);
  });
});
