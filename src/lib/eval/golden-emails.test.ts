import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  scoreDeliverability,
  scoreRubric,
  scoreRubricTotal,
} from "@/lib/agents/writer-scoring";

type GoldenEmail = {
  id: string;
  label: string;
  expectedBand: "weak" | "strong";
  sequencePosition?: number;
  subjectA: string;
  emailBody: string;
  contact: { name: string; firstName?: string; title?: string };
  account: { name: string; industry?: string; city?: string; employees?: string };
  giftingHook?: string;
  minRubricTotal?: number;
  maxRubricTotal?: number;
  minDeliverability?: number;
  maxDeliverability?: number;
};

const goldenPath = join(process.cwd(), "eval/golden-emails.json");
const goldenEmails = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenEmail[];

describe("EVAL-001 golden email regression", () => {
  it.each(goldenEmails.map((e) => [e.id, e] as const))("%s (%s)", async (id, sample) => {
    const deliv = await scoreDeliverability(sample.emailBody, sample.subjectA, {
      sequencePosition: sample.sequencePosition ?? 1,
      contactFirstName: sample.contact.firstName ?? sample.contact.name.split(" ")[0],
      account: { name: sample.account.name },
    });

    const rubric = await scoreRubric({
      subjectA: sample.subjectA,
      emailBody: sample.emailBody,
      contact: sample.contact,
      account: sample.account,
      giftingHook: sample.giftingHook,
    });
    const rubricTotal = scoreRubricTotal(rubric);

    if (sample.minDeliverability != null) {
      expect(deliv, `${id} deliverability`).toBeGreaterThanOrEqual(sample.minDeliverability);
    }
    if (sample.maxDeliverability != null) {
      expect(deliv, `${id} deliverability`).toBeLessThanOrEqual(sample.maxDeliverability);
    }
    if (sample.minRubricTotal != null) {
      expect(rubricTotal, `${id} rubric`).toBeGreaterThanOrEqual(sample.minRubricTotal);
    }
    if (sample.maxRubricTotal != null) {
      expect(rubricTotal, `${id} rubric`).toBeLessThanOrEqual(sample.maxRubricTotal);
    }

    if (sample.expectedBand === "weak") {
      expect(deliv < 80 || rubricTotal < 80, `${id} should classify weak`).toBe(true);
    } else {
      expect(rubricTotal, `${id} strong rubric`).toBeGreaterThanOrEqual(sample.minRubricTotal ?? 65);
    }
  });
});
