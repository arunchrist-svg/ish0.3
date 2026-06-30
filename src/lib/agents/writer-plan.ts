import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { db, leadResearch, leads, contacts, accounts } from "@/db";
import { eq } from "drizzle-orm";
import type { WriterPlan } from "@/db/schema";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";

export const writerPlanSchema = z.object({
  hook: z.string().min(8),
  valueProp: z.string().min(8),
  cta: z.string().min(8),
});

export type ParsedWriterPlan = z.infer<typeof writerPlanSchema>;

export class ResearchNotReadyError extends Error {
  code = "RESEARCH_NOT_READY" as const;
  missing: string[];

  constructor(missing: string[]) {
    super(`Research brief incomplete: missing ${missing.join(", ")}`);
    this.name = "ResearchNotReadyError";
    this.missing = missing;
  }
}

export function getResearchQualityGaps(research: {
  giftingHook?: string | null;
  decisionChain?: string[] | null;
} | null | undefined): string[] {
  const gaps: string[] = [];
  if (!research?.giftingHook?.trim()) gaps.push("giftingHook");
  if (!research?.decisionChain?.length) gaps.push("decisionChain");
  return gaps;
}

export function assertResearchReadyForWriter(
  research: { giftingHook?: string | null; decisionChain?: string[] | null } | null | undefined,
): void {
  const gaps = getResearchQualityGaps(research);
  if (gaps.length) throw new ResearchNotReadyError(gaps);
}

export function formatWriterPlanForPrompt(plan: WriterPlan): string {
  return `Outreach plan (follow this structure):
- Hook: ${plan.hook}
- Value: ${plan.valueProp}
- CTA: ${plan.cta}`;
}

export async function generateWriterPlan(leadId: string): Promise<WriterPlan> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;

  const prompt = `Create a 3-part cold email plan for B2B corporate gifting outreach.

Company: ${account.name}
Contact: ${contact.name}, ${contact.title ?? "Unknown"}
Industry: ${account.industry ?? "Corporate"}
Gifting hook: ${research?.giftingHook ?? "General Diwali gifting"}
Intel: ${account.intelNotes ?? "none"}

Output ONLY JSON:
{
  "hook": "one specific opening angle (no em dashes)",
  "valueProp": "one sentence on why our gifting offer matters to them",
  "cta": "one soft CTA question for email 1"
}`;

  const raw = await callLLM({
    tier: tierForAgentStep("writer.plan"),
    system: "You output only valid JSON. No markdown.",
    prompt,
    maxTokens: 256,
    trace: {
      agent: "writer-plan",
      tenantId: lead.tenantId,
      workspaceId: lead.workspaceId,
      leadId,
      promptVersion: "v1",
    },
  });

  let plan: ParsedWriterPlan;
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = writerPlanSchema.safeParse(obj);
    if (!parsed.success) throw parsed.error;
    plan = parsed.data;
  } catch {
    plan = {
      hook: research?.giftingHook ?? `Diwali gifting angle for ${account.name}`,
      valueProp: "Premium corporate mithai and hamper options for teams.",
      cta: "Open to a quick note on a few hamper formats?",
    };
  }

  const writerPlan: WriterPlan = {
    ...plan,
    source: "llm",
    updatedAt: new Date().toISOString(),
  };

  if (research) {
    await db
      .update(leadResearch)
      .set({ writerPlan })
      .where(eq(leadResearch.leadId, leadId));
  }

  return writerPlan;
}

export async function ensureWriterPlan(leadId: string): Promise<WriterPlan | null> {
  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });
  if (!research) return null;

  const existing = research.writerPlan as WriterPlan | null;
  if (existing?.hook && existing.valueProp && existing.cta) {
    return existing;
  }

  return generateWriterPlan(leadId);
}

export async function updateWriterPlan(leadId: string, plan: ParsedWriterPlan): Promise<WriterPlan> {
  const writerPlan: WriterPlan = {
    ...plan,
    source: "user",
    updatedAt: new Date().toISOString(),
  };

  await db.update(leadResearch).set({ writerPlan }).where(eq(leadResearch.leadId, leadId));
  return writerPlan;
}
