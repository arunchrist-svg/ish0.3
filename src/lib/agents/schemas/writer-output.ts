import { z } from "zod";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";

export const writerOutputSchema = z.object({
  subjectA: z.string().min(1).optional(),
  subjectB: z.string().min(1).optional(),
  emailBody: z.string().min(1).optional(),
  outreachGoal: z.string().min(1).optional(),
  templateVariant: z.string().optional(),
});

export type WriterOutput = z.infer<typeof writerOutputSchema>;

export function parseWriterOutput(raw: string): { data: WriterOutput; valid: boolean } {
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = writerOutputSchema.safeParse(obj);
    if (parsed.success) {
      return { data: parsed.data, valid: true };
    }
    return { data: writerOutputSchema.partial().parse(obj), valid: false };
  } catch {
    return { data: {}, valid: false };
  }
}
