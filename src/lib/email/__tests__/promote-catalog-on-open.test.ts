import { describe, expect, it } from "vitest";
import { resolveCatalogUpgradeTarget } from "@/lib/email/promote-catalog-on-open";
import { isIshFestiveCatalogBody, buildIshFestiveCatalogParagraphs } from "@/lib/email/ish-festive-catalog";

describe("festive catalogue on open", () => {
  it("detects catalogue bodies", () => {
    expect(isIshFestiveCatalogBody(buildIshFestiveCatalogParagraphs("India Sweet House"))).toBe(true);
    expect(isIshFestiveCatalogBody("Would you be open to a sample box?")).toBe(false);
  });

  it("has no em dashes in catalogue copy", () => {
    expect(buildIshFestiveCatalogParagraphs("India Sweet House")).not.toMatch(/—/);
  });

  it("upgrades Email 2 after Email 1 open", () => {
    expect(
      resolveCatalogUpgradeTarget({
        openedSequenceDay: 0,
        drafts: [
          { sequencePosition: 1, emailBody: "e1" },
          { sequencePosition: 2, emailBody: "short sample" },
          { sequencePosition: 3, emailBody: "breakup" },
        ],
      }),
    ).toBe(2);
  });

  it("upgrades Email 3 after Email 2 open when Email 2 was not catalogue", () => {
    expect(
      resolveCatalogUpgradeTarget({
        openedSequenceDay: 3,
        drafts: [
          { sequencePosition: 2, emailBody: "short sample" },
          { sequencePosition: 3, emailBody: "breakup" },
        ],
      }),
    ).toBe(3);
  });

  it("skips upgrade when Email 2 is already the catalogue", () => {
    const catalog = buildIshFestiveCatalogParagraphs("India Sweet House");
    expect(
      resolveCatalogUpgradeTarget({
        openedSequenceDay: 3,
        drafts: [
          { sequencePosition: 2, emailBody: catalog },
          { sequencePosition: 3, emailBody: "breakup" },
        ],
      }),
    ).toBeNull();
  });
});
