import { describe, expect, it } from "vitest";
import {
  freeCompanyFilterProvider,
  parseCompanyFilterKeepNames,
} from "@/lib/enrichment/filter-companies-llm";

describe("parseCompanyFilterKeepNames", () => {
  it("keeps string company names and drops junk via cleanCompanyName", () => {
    const kept = parseCompanyFilterKeepNames(
      JSON.stringify([
        "Kovaion Consulting India Pvt Ltd",
        "Bellandur",
        "Karnataka. 4th Floor",
        "Prestige Technostar",
        "Infosys",
      ]),
    );
    expect(kept).toEqual(["Kovaion Consulting India Pvt Ltd", "Infosys"]);
  });

  it("accepts object rows and cleans company+place strings", () => {
    const kept = parseCompanyFilterKeepNames(
      `Here you go:\n\`\`\`json\n[{"name":"Netcracker Technology India Pvt Ltd in Dairy Circle","keep":true},{"name":"Hobli","keep":false}]\n\`\`\``,
    );
    expect(kept).toEqual(["Netcracker Technology India Pvt Ltd"]);
  });
});

describe("freeCompanyFilterProvider", () => {
  it("returns local, openrouter, anthropic, or null, never gemini", () => {
    const provider = freeCompanyFilterProvider();
    expect(provider === null || provider === "openrouter" || provider === "local" || provider === "anthropic").toBe(true);
    expect(provider).not.toBe("gemini");
  });
});
