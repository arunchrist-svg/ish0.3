import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseCsvContent, parseXlsxBuffer } from "@/lib/leads/import/parse-sheet";
import { heuristicMapColumns } from "@/lib/leads/import/ai-map-columns";
import { applyColumnMapping, mappingHasRequiredFields, nameFromEmailLocal } from "@/lib/leads/import/apply-mapping";
import { planBulkImport } from "@/lib/leads/import/bulk-plan";

const SEASON_HEADERS = [
  "Company Name",
  "Person Name",
  "Email",
  "Phone",
  "Source File",
  "Source Sheet",
];

function seasonWorkbookBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    SEASON_HEADERS,
    ["Daysie", "", "", "", "Leads Status Report aug to oct.xlsx", "ZOYA"],
    ["minizmo", "", "rohan@minizmo.com", "9911900111", "Leads Status Report aug to oct.xlsx", "PRASANT"],
    ["Mysore Silk Udyog", "Anil", "", "9341218080", "CLIENT LEADS old.xlsx", "General Leads"],
    ["", "Orphan", "a@example.com", "", "CLIENT LEADS old.xlsx", "Sheet1"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Clean Leads");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("lead import parse + map", () => {
  it("parses quoted CSV rows", () => {
    const csv = `Full Name,Organisation,Email Address\n"Doe, Jane",Acme Inc,jane@acme.com\nBob Smith,Beta LLC,bob@beta.com\n`;
    const parsed = parseCsvContent(csv);
    expect(parsed.headers).toEqual(["Full Name", "Organisation", "Email Address"]);
    expect(parsed.rowCount).toBe(2);
    expect(parsed.rows[0]["Full Name"]).toBe("Doe, Jane");
  });

  it("maps common synonyms heuristically", () => {
    const mapped = heuristicMapColumns(["Full Name", "Organisation", "Job Title", "Email Address", "Mobile"]);
    expect(mapped.mappings["Full Name"]).toBe("name");
    expect(mapped.mappings["Organisation"]).toBe("company");
    expect(mapped.mappings["Job Title"]).toBe("title");
    expect(mapped.mappings["Email Address"]).toBe("email");
    expect(mapped.mappings["Mobile"]).toBe("phone");
    expect(mappingHasRequiredFields(mapped.mappings).ok).toBe(true);
  });

  it("maps season-leads headers without confusing Company Name with person name", () => {
    const mapped = heuristicMapColumns(SEASON_HEADERS);
    expect(mapped.mappings["Company Name"]).toBe("company");
    expect(mapped.mappings["Person Name"]).toBe("name");
    expect(mapped.mappings.Email).toBe("email");
    expect(mapped.mappings.Phone).toBe("phone");
    expect(mapped.mappings["Source File"]).toBe("tags");
    expect(mapped.mappings["Source Sheet"]).toBe("tags");
    expect(mappingHasRequiredFields(mapped.mappings).ok).toBe(true);
  });

  it("applies mapping and merges first/last name", () => {
    const mapping = {
      "First Name": "firstName" as const,
      "Last Name": "lastName" as const,
      Company: "company" as const,
      Email: "email" as const,
    };
    const { rows, invalid } = applyColumnMapping(
      [{ "First Name": "Ada", "Last Name": "Lovelace", Company: "Analytical Engines", Email: "ada@analytical.example" }],
      mapping,
    );
    expect(invalid).toHaveLength(0);
    expect(rows[0].name).toBe("Ada Lovelace");
    expect(rows[0].company).toBe("Analytical Engines");
    expect(rows[0].email).toBe("ada@analytical.example");
  });

  it("skips rows without email and keeps a mapped Gmail address", () => {
    const mapping = heuristicMapColumns(SEASON_HEADERS).mappings;
    const parsed = parseXlsxBuffer(seasonWorkbookBuffer());
    const { rows, invalid, skipped } = applyColumnMapping(parsed.rows, mapping);

    expect(parsed.headers).toEqual(SEASON_HEADERS);
    expect(invalid).toEqual([{ rowIndex: 5, reason: "Missing company" }]);
    expect(skipped.map((row) => row.reason)).toEqual(["Missing email", "Missing email"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Rohan");
    expect(rows[0].email).toBe("rohan@minizmo.com");
    expect(rows[0].phone).toBe("9911900111");
  });

  it("keeps a Gmail address from the Email column for an empty person name", () => {
    const mapping = heuristicMapColumns(SEASON_HEADERS).mappings;
    const { rows, skipped, invalid } = applyColumnMapping(
      [
        {
          "Company Name": "ABHIJIT GUPTA",
          "Person Name": "",
          Email: "abgupta89@gmail.com",
          Phone: "9886026747",
          "Source File": "LEADS NOV 2023 - Main Sheet_.xlsx",
          "Source Sheet": "PERSONALITY LEADS",
        },
      ],
      mapping,
    );
    expect(invalid).toHaveLength(0);
    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("abgupta89@gmail.com");
    expect(rows[0].name).toBe("Abgupta");
    expect(rows[0].company).toBe("ABHIJIT GUPTA");
    expect(rows[0].phone).toBe("9886026747");
  });

  it("derives a person name from an email local part", () => {
    expect(nameFromEmailLocal("rohan@minizmo.com")).toBe("Rohan");
    expect(nameFromEmailLocal("info@minizmo.com")).toBe("");
  });

  it("parses the season leads sample workbook when present", () => {
    const samplePath = "/Users/arun.murugesan/Downloads/season leads.xlsx";
    if (!existsSync(samplePath)) return;

    const parsed = parseXlsxBuffer(readFileSync(samplePath));
    expect(parsed.headers).toEqual(SEASON_HEADERS);
    expect(parsed.rowCount).toBe(2224);

    const mapped = heuristicMapColumns(parsed.headers);
    expect(mapped.mappings["Company Name"]).toBe("company");
    expect(mapped.mappings["Person Name"]).toBe("name");

    const { rows, invalid, skipped } = applyColumnMapping(parsed.rows, mapped.mappings);
    const withEmail = parsed.rows.filter((row) => (row.Email ?? "").trim());
    const loadable = withEmail.filter((row) => (row["Company Name"] ?? "").trim());
    expect(invalid.every((row) => row.reason === "Missing company")).toBe(true);
    expect(skipped.every((row) => row.reason === "Missing email")).toBe(true);
    expect(rows.length + invalid.length + skipped.length).toBe(2224);
    expect(rows.length).toBe(loadable.length);
    expect(loadable.length).toBeGreaterThan(1000);
    expect(rows.every((row) => Boolean(row.email))).toBe(true);
    expect(rows.some((row) => row.email === "abgupta89@gmail.com")).toBe(true);
    const abgupta = rows.filter((row) => row.email === "abgupta89@gmail.com");
    expect(abgupta.map((row) => row.company).sort()).toEqual([
      "ABHIJIT GUPTA",
      "Abhijit gupta - paris panini, pizza bakery",
    ]);
  });
});

describe("planBulkImport", () => {
  it("reuses one account for two people at the same company and skips duplicates", () => {
    const plan = planBulkImport({
      existingAccounts: [{ id: "acct-acme", name: "Acme" }],
      existingLeads: [{ id: "lead-1", contactId: "c-1", name: "Ada Lovelace", company: "Acme", email: "ada@acme.com" }],
      rows: [
        { rowIndex: 2, name: "Ada Lovelace", company: "Acme", email: "ada@acme.com" },
        { rowIndex: 3, name: "Grace Hopper", company: "Acme", email: "grace@acme.com" },
        { rowIndex: 4, name: "Grace Hopper", company: "Acme", email: "grace@acme.com" },
        { rowIndex: 5, name: "Daysie", company: "Daysie", email: "hello@daysie.com" },
      ],
    });

    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped.map((row) => row.rowIndex)).toEqual([2, 4]);
    expect(plan.newAccounts).toHaveLength(1);
    expect(plan.newAccounts[0]?.name).toBe("Daysie");
    expect(plan.toInsert).toHaveLength(2);
    expect(plan.toInsert[0]?.accountId).toBe("acct-acme");
    expect(plan.toInsert[1]?.accountId).toBe(plan.newAccounts[0]?.id);
  });

  it("backfills Gmail on an existing lead that is missing email", () => {
    const plan = planBulkImport({
      existingAccounts: [{ id: "acct-1", name: "ABHIJIT GUPTA" }],
      existingLeads: [
        { id: "lead-1", contactId: "c-1", name: "Abgupta", company: "ABHIJIT GUPTA", email: null },
      ],
      rows: [
        {
          rowIndex: 2,
          name: "Abgupta",
          company: "ABHIJIT GUPTA",
          email: "abgupta89@gmail.com",
          phone: "9886026747",
        },
      ],
    });
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.toUpdateEmail).toEqual([
      expect.objectContaining({
        contactId: "c-1",
        leadId: "lead-1",
        email: "abgupta89@gmail.com",
      }),
    ]);
  });

  it("inserts a Gmail address from the mapped Email column as-is", () => {
    const plan = planBulkImport({
      existingAccounts: [],
      existingLeads: [],
      rows: [
        {
          rowIndex: 2053,
          name: "Abgupta",
          company: "ABHIJIT GUPTA",
          email: "abgupta89@gmail.com",
          phone: "9886026747",
        },
      ],
    });
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0]?.row.email).toBe("abgupta89@gmail.com");
    expect(plan.toUpdateEmail).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it("replaces a guessed company email with the spreadsheet Gmail address", () => {
    const plan = planBulkImport({
      existingAccounts: [{ id: "acct-1", name: "Aamogh" }],
      existingLeads: [
        {
          id: "lead-1",
          contactId: "c-1",
          name: "Aamogh Co",
          company: "Aamogh",
          email: "aamogh.co@aamogh.com",
          enrichmentProvider: "permutation",
          enrichmentSource: "name_domain_guess:first.last",
        },
      ],
      rows: [
        {
          rowIndex: 2,
          name: "Aamogh Co",
          company: "Aamogh",
          email: "aamogh.co@gmail.com",
          phone: "9541410397",
        },
      ],
    });
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.toUpdateEmail).toEqual([
      expect.objectContaining({
        contactId: "c-1",
        leadId: "lead-1",
        email: "aamogh.co@gmail.com",
      }),
    ]);
  });
});

