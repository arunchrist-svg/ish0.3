import { describe, expect, it } from "vitest";
import {
  countDuplicateExtras,
  groupDuplicateLeads,
  nameCompanyDedupeKey,
  normalizePersonName,
  pickDuplicateKeeper,
} from "@/lib/leads/duplicates";

describe("lead duplicate grouping", () => {
  it("normalizes person names", () => {
    expect(normalizePersonName("Abhimanyu  Sen")).toBe("abhimanyu sen");
    expect(normalizePersonName("ABHIMANYU SEN")).toBe("abhimanyu sen");
  });

  it("treats legal suffixes as the same company", () => {
    expect(nameCompanyDedupeKey("Abhimanyu Sen", "Seg Automotive India Pvt Ltd")).toBe(
      nameCompanyDedupeKey("Abhimanyu Sen", "SEG Automotive India"),
    );
  });

  it("keeps the furthest pipeline stage, then higher score", () => {
    const keeper = pickDuplicateKeeper([
      { id: "a", name: "Abhimanyu Sen", company: "Seg", status: "scouted", score: 100 },
      { id: "b", name: "Abhimanyu Sen", company: "Seg", status: "draft_ready", score: 80 },
    ]);
    expect(keeper.id).toBe("b");
  });

  it("groups same name and company even with different statuses", () => {
    const groups = groupDuplicateLeads([
      { id: "a", name: "Abhimanyu Sen", company: "Seg Automotive India Pvt Ltd", status: "scouted", score: 100 },
      { id: "b", name: "Abhimanyu Sen", company: "SEG Automotive India", status: "draft_ready", score: 100 },
      { id: "c", name: "Other Person", company: "Seg Automotive India", status: "scouted", score: 50 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.keepId).toBe("b");
    expect(groups[0]?.leads.map((lead) => lead.id).sort()).toEqual(["a", "b"]);
    expect(countDuplicateExtras(groups.flatMap((group) => group.leads).concat([
      { id: "c", name: "Other Person", company: "Seg Automotive India", status: "scouted", score: 50 },
    ]))).toBe(1);
  });

  it("groups by shared email across company spellings", () => {
    const groups = groupDuplicateLeads([
      {
        id: "a",
        name: "Priya Nair",
        company: "Acme Foods",
        status: "scouted",
        score: 40,
        email: "priya@acme.com",
      },
      {
        id: "b",
        name: "Priya Nair",
        company: "ACME Food Pvt Ltd",
        status: "researched",
        score: 70,
        email: "Priya@acme.com",
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.keepId).toBe("b");
  });

  it("does not group different people at the same company", () => {
    const groups = groupDuplicateLeads([
      { id: "a", name: "Riya Shah", company: "Ish Demo", status: "scouted", score: 60 },
      { id: "b", name: "Aman Gupta", company: "Ish Demo", status: "scouted", score: 60 },
    ]);
    expect(groups).toHaveLength(0);
    expect(countDuplicateExtras([
      { id: "a", name: "Riya Shah", company: "Ish Demo", status: "scouted", score: 60 },
      { id: "b", name: "Aman Gupta", company: "Ish Demo", status: "scouted", score: 60 },
    ])).toBe(0);
  });
});
