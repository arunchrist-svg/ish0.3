import { describe, expect, it } from "vitest";
import { sanitizeJobTitle } from "@/lib/enrichment/job-title";

describe("sanitizeJobTitle", () => {
  it("keeps real designations", () => {
    expect(sanitizeJobTitle("Chief Human Resources Officer")).toBe("Chief Human Resources Officer");
    expect(sanitizeJobTitle("Plant HR Manager")).toBe("Plant HR Manager");
    expect(sanitizeJobTitle("CHRO")).toBe("CHRO");
    expect(sanitizeJobTitle("Sr. Manager Process Engineering/NPD at Pavna Industries Ltd")).toBe(
      "Sr. Manager Process Engineering/NPD at Pavna Industries Ltd",
    );
    expect(sanitizeJobTitle("HR Executive at The New India Assurance Co. Ltd.")).toBe(
      "HR Executive at The New India Assurance Co. Ltd.",
    );
    expect(
      sanitizeJobTitle("Head of Human Resources Site, Legal, People Engagement, and Industrial Relations"),
    ).toBe("Head of Human Resources Site, Legal, People Engagement, and Industrial Relations");
    expect(sanitizeJobTitle("I am HR - Director Business Partner at Global Services Tenneco")).toBe(
      "I am HR - Director Business Partner at Global Services Tenneco",
    );
  });

  it("rejects news snippets used as Vidya Tewari's title", () => {
    expect(
      sanitizeJobTitle(
        "March 8, 2026 - Ganesh Mani, and President & Head HR Mr. Raja Radhakrishnan . This",
      ),
    ).toBeUndefined();
  });

  it("rejects other-person honorifics and long article fragments", () => {
    expect(sanitizeJobTitle("President & Head HR Mr. Raja Radhakrishnan")).toBeUndefined();
    expect(
      sanitizeJobTitle("Ashok Leyland appoints Ganesh Mani as something very long and unrelated"),
    ).toBeUndefined();
  });

  it("rejects Team Lead and Open to Work titles", () => {
    expect(sanitizeJobTitle("HR Team Lead")).toBeUndefined();
    expect(sanitizeJobTitle("People Teamlead")).toBeUndefined();
    expect(sanitizeJobTitle("HR Director | Open to Work")).toBeUndefined();
    expect(sanitizeJobTitle("HR Manager OPEN_TO_WORK")).toBeUndefined();
  });
});
