import { describe, it, expect } from "vitest";
import { computeSeniorityScore } from "../seniority-score";
import golden from "../../../../eval/golden-seniority.json";

describe("seniority-score", () => {
  for (const row of golden) {
    it(`scores ${row.title}`, () => {
      const { total } = computeSeniorityScore({ title: row.title, isKeyDM: /hr|procurement/i.test(row.title) });
      expect(total).toBeGreaterThanOrEqual(row.minScore);
      expect(total).toBeLessThanOrEqual(row.maxScore);
    });
  }
});
