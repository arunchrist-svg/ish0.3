import { resolveWriterMode, runWriter } from "@/lib/agents/writer";
import { runWriterSequence } from "@/lib/agents/writer-sequence";
import { assertCredits, deductCredits, InsufficientCreditsError } from "@/lib/billing/credits";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import {
  isZeroCostTemplateWrite,
  type OutreachTemplateId,
} from "@/lib/email/outreach-templates";

export type WriterJobParams = {
  leadId: string;
  tenantId: string;
  mode?: "single" | "sequence";
  outreachTemplate?: string;
  writerMode?: string;
  occasionTheme?: string | null;
  batchId?: string;
};

/**
 * Shared write path for Inngest + sync fallback.
 * Bills writer.draft credits (1 for single, 3 for sequence), except fixed-copy templates.
 */
export async function writeOutreachForJob(params: WriterJobParams): Promise<{ outreachIds: string[] }> {
  const writerMode = resolveWriterMode(params.writerMode);
  const template = params.outreachTemplate as OutreachTemplateId | undefined;
  const mode = params.mode === "single" ? "single" : "sequence";
  const draftCount = mode === "single" ? 1 : 3;
  const batchKey = params.batchId ?? "adhoc";
  const freeTemplate = isZeroCostTemplateWrite(template);

  if (!freeTemplate) {
    try {
      await assertCredits(params.tenantId, "writer.draft", draftCount);
    } catch (e) {
      if (e instanceof InsufficientCreditsError) throw e;
      throw e;
    }
  }

  if (mode === "single") {
    const outreachId = await runWriter(params.leadId, {
      outreachTemplate: template,
      writerMode,
      occasionTheme: params.occasionTheme,
    });
    if (!freeTemplate) {
      await deductCredits({
        tenantId: params.tenantId,
        action: "writer.draft",
        referenceId: outreachId,
        idempotencyKey: `writer:${batchKey}:${params.leadId}:${outreachId}`,
      });
      void checkLowBalanceAlerts(params.tenantId);
    }
    return { outreachIds: [outreachId] };
  }

  const ids = await runWriterSequence(params.leadId, {
    outreachTemplate: template,
    writerMode,
    occasionTheme: params.occasionTheme,
  });
  if (!freeTemplate) {
    for (const id of ids) {
      await deductCredits({
        tenantId: params.tenantId,
        action: "writer.draft",
        referenceId: id,
        idempotencyKey: `writer:${batchKey}:${params.leadId}:${id}`,
      });
    }
    void checkLowBalanceAlerts(params.tenantId);
  }
  return { outreachIds: ids };
}
