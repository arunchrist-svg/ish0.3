import { describe, expect, it } from "vitest";
import { addedByCaption } from "@/components/leads/lead-added-by-button";

describe("addedByCaption", () => {
  it("uses the person name when present", () => {
    expect(addedByCaption({ name: "Kasturinagar", leadSource: "csv_import" })).toBe(
      "Added by Kasturinagar",
    );
  });

  it("falls back to Excel import when the uploader was not stored", () => {
    expect(addedByCaption({ name: null, leadSource: "csv_import" })).toBe("Added by Excel import");
  });

  it("falls back to Scout for wizard leads", () => {
    expect(addedByCaption({ name: "  ", leadSource: "scout_wizard" })).toBe("Added by Scout");
  });

  it("does not say unknown", () => {
    expect(addedByCaption({})).toBe("Added by team");
  });
});
