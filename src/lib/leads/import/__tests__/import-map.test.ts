import { describe, expect, it } from "vitest";
import { parseCsvContent } from "@/lib/leads/import/parse-sheet";
import { heuristicMapColumns } from "@/lib/leads/import/ai-map-columns";
import { applyColumnMapping, mappingHasRequiredFields } from "@/lib/leads/import/apply-mapping";

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

  it("applies mapping and merges first/last name", () => {
    const mapping = {
      "First Name": "firstName" as const,
      "Last Name": "lastName" as const,
      Company: "company" as const,
    };
    const { rows, invalid } = applyColumnMapping(
      [{ "First Name": "Ada", "Last Name": "Lovelace", Company: "Analytical Engines" }],
      mapping,
    );
    expect(invalid).toHaveLength(0);
    expect(rows[0].name).toBe("Ada Lovelace");
    expect(rows[0].company).toBe("Analytical Engines");
  });
});
