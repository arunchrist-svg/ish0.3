import { z } from "zod";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";

const scoreFactorSchema = z.object({
  label: z.string(),
  bold: z.string(),
});

export const researcherOutputSchema = z.object({
  giftingHook: z.string().min(1),
  estimatedOrderValue: z.string().optional(),
  decisionChain: z.array(z.string()).default([]),
  outreachHooks: z.array(z.string()).default([]),
  scoreFactors: z.array(scoreFactorSchema).default([]),
});

export type ResearcherOutput = z.infer<typeof researcherOutputSchema>;

export function parseResearcherOutput(raw: string): { data: ResearcherOutput | null; valid: boolean } {
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = researcherOutputSchema.safeParse(obj);
    if (parsed.success) {
      return { data: parsed.data, valid: true };
    }
    return { data: null, valid: false };
  } catch {
    return { data: null, valid: false };
  }
}
