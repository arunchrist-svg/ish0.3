import { tool } from "ai";
import { z } from "zod";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { assertPlanEntitlement } from "@/lib/billing/entitlements";
import { checkLowBalanceAlerts } from "@/lib/billing/analytics";
import { enrichLeadById } from "@/lib/enrichment/enrich-lead";
import { hasAnyPaidProvider } from "@/lib/enrichment/provider-config";
import type { DataMode } from "@/lib/enrichment/types";
import { requireAccessibleLead } from "./access";
import { logToolAction } from "./logging";
import type { AgentToolContext } from "./types";

export const enrichContactInput = z.object({
  leadId: z.string().uuid().describe("The CRM lead ID whose contact should be enriched"),
  mode: z.enum(["free", "paid"]).default("free").describe("The enrichment provider mode"),
  dataMode: z.enum(["free", "paid", "auto"]).optional().describe("The workspace data mode override"),
  refetch: z.boolean().default(false).describe("Whether to fetch fresh data instead of using cached results"),
});

export function createEnrichContactTool(context: AgentToolContext) {
  return tool({
    description:
      "Enrich an accessible lead contact with the configured provider, returning verified email, phone, title, and confidence. Paid mode consumes one credit.",
    inputSchema: enrichContactInput,
    execute: async (input) => {
      await requireAccessibleLead(context, input.leadId);
      if (input.mode === "paid") {
        await assertPlanEntitlement(context.ctx.tenantId, "paid_enrichment");
        if (!hasAnyPaidProvider()) {
          throw new Error("Paid enrichment is not available");
        }
        await assertCredits(context.ctx.tenantId, "enrich.paid", 1);
      }

      const result = await enrichLeadById({
        leadId: input.leadId,
        mode: input.mode,
        dataMode: input.dataMode as DataMode | undefined,
        refetch: input.refetch,
      });

      if (input.mode === "paid" && result.success) {
        await deductCredits({
          tenantId: context.ctx.tenantId,
          action: "enrich.paid",
          referenceId: input.leadId,
        });
        void checkLowBalanceAlerts(context.ctx.tenantId);
      }

      const output = {
        ok: true,
        leadId: result.leadId,
        success: result.success,
        email: result.email ?? null,
        phone: result.phone ?? null,
        title: result.title ?? null,
        emailStatus: result.emailStatus,
        confidenceTier: result.confidenceTier,
        enrichmentProvider: result.enrichmentProvider ?? null,
        message: result.message ?? null,
      };
      await logToolAction({
        context,
        actionType: "enrichContact",
        payload: input,
        result: output,
      });
      return output;
    },
  });
}
