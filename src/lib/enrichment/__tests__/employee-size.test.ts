import { describe, expect, it } from "vitest";
import {
  apolloEmployeeRanges,
  employeeMatchesBands,
  employeeSizeSearchClause,
  extractEmployeesFromText,
  formatCompanyScale,
  formatEmployeeCount,
  formatScoutSizeLine,
  parseEmployeeRange,
  rankAndFilterByEmployeeBands,
} from "@/lib/enrichment/employee-size";

describe("parseEmployeeRange", () => {
  it("parses exact, ranged, plus, and scale labels", () => {
    expect(parseEmployeeRange("8,500")).toEqual({ min: 8500, max: 8500 });
    expect(parseEmployeeRange("200-500 employees")).toEqual({ min: 200, max: 500 });
    expect(parseEmployeeRange("100+")).toEqual({ min: 100, max: Number.POSITIVE_INFINITY });
    expect(parseEmployeeRange("—")).toBeNull();
    expect(parseEmployeeRange("Small scale")).toEqual({ min: 11, max: 50 });
    expect(parseEmployeeRange("Micro Industries")).toEqual({ min: 1, max: 10 });
  });
});

describe("employeeMatchesBands", () => {
  it("matches overlapping ranges and keeps unknown distinct", () => {
    expect(employeeMatchesBands("180", ["medium"])).toBe(true);
    expect(employeeMatchesBands("350", ["large"])).toBe(true);
    expect(employeeMatchesBands("50", ["medium"])).toBe(false);
    expect(employeeMatchesBands("—", ["medium"])).toBe("unknown");
    expect(employeeMatchesBands("200-500", ["medium"])).toBe(true);
    expect(employeeMatchesBands("Small scale", ["small"])).toBe(true);
  });
});

describe("employee search helpers", () => {
  it("builds a scale clause and Apollo ranges", () => {
    expect(employeeSizeSearchClause(["medium"])).toContain("medium scale");
    expect(apolloEmployeeRanges(["micro", "large"])).toEqual([
      "1,10",
      "201,500",
      "501,1000",
      "1001,5000",
      "5001,10000",
      "10001",
    ]);
  });

  it("extracts headcount or scale from directory text", () => {
    expect(extractEmployeesFromText("Hikal Ltd, 1,200 employees, Bengaluru")).toMatch(/1,200/i);
    expect(extractEmployeesFromText("ABC Polymers, small scale industry, Hosur")).toBe("Small scale");
  });

  it("formats card scale from a numeric headcount", () => {
    expect(formatCompanyScale("8")).toBe("Micro Industries");
    expect(formatCompanyScale("40")).toBe("Small scale");
    expect(formatCompanyScale("180")).toBe("Medium scale");
    expect(formatCompanyScale("8,500")).toBe("Large scale");
    expect(formatCompanyScale("—")).toBe("Unknown scale");
  });

  it("shows total employees next to scale on scout cards", () => {
    expect(formatEmployeeCount("8,500")).toBe("8,500");
    expect(formatEmployeeCount("Small scale")).toBeNull();
    expect(formatScoutSizeLine("8,500")).toBe("Large scale · 8,500");
    expect(formatScoutSizeLine("Small scale")).toBe("Small scale");
    expect(formatScoutSizeLine("—")).toBe("Unknown scale");
  });

  it("ranks known matches ahead of unknown and drops mismatches", () => {
    const ranked = rankAndFilterByEmployeeBands(
      [
        { name: "Big", employees: "8000" },
        { name: "Unknown", employees: undefined },
        { name: "Mid", employees: "180" },
      ],
      ["medium"],
    );
    expect(ranked.companies.map((c) => c.name)).toEqual(["Mid", "Unknown"]);
    expect(ranked.droppedKnown).toBe(1);
    expect(ranked.unknownCount).toBe(1);
  });
});
