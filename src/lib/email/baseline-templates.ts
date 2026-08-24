import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";

export type BaselineTemplateId = "gift_sampling" | "meet_online" | "meet_in_person" | "follow_up" | "final_reminder";

export function getBaselineEmail(params: {
  sequencePosition: number;
  templateId?: string | null;
  contactFirstName: string;
  senderFirstName: string;
  brandName: string;
  companyName?: string | null;
}): string {
  const copy = fillIshDraftVariants({
    contactFirstName: params.contactFirstName,
    companyName: params.companyName ?? "your team",
    senderFirstName: params.senderFirstName,
    brandName: params.brandName,
    sequencePosition: params.sequencePosition,
    templateId: params.templateId,
  });
  return copy.emailBody;
}

export const TRANSFORMATION_RULES = `TRANSFORMATION RULES:
1. Keep at least 90% of the ISH template wording. Only fill first name and company. Do not rewrite the hook into industry or city copy.
2. The two body options must stay two different sequences, not two paraphrases of one idea.
3. Never write "before vendors lock in", "before Hosur vendors lock in", or any "vendors lock in" urgency.
4. Never mention employee count, headcount, or revenue.
5. Ban brochure lines: do not write "{brand} offers..." or "{brand} specializes in...".
6. Sign off with Thanks & Regards, then the From name from settings, then brand. No No worries line on Email 1.
7. Company mentions use the short trading name only. Never write Pvt Ltd, Private Limited, India Pvt Ltd, Ltd, or LLP after the company name.`;
