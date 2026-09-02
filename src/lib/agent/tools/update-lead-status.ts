import { tool } from "ai";
import { z } from "zod";
import { updateLeadStatus as advanceLeadStatus } from "@/lib/leads/crud";
import { requireAccessibleLead } from "./access";
import { logToolAction } from "./logging";
import type { AgentToolContext } from "./types";

export const updateLeadStatusInput = z.object({
  leadId: z.string().uuid().describe("The CRM lead ID to update"),
  status: z
    .enum(["tasting_sent", "negotiate", "closed"])
    .describe("The next permitted manual pipeline status"),
  closedDealAmount: z
    .string()
    .trim()
    .optional()
    .describe("Required when closing a deal, for example ₹5 lakhs"),
});

export function createUpdateLeadStatusTool(context: AgentToolContext) {
  return tool({
    description:
      "Advance an accessible lead through one permitted manual pipeline step. Closing requires a positive deal amount.",
    inputSchema: updateLeadStatusInput,
    execute: async (input) => {
      await requireAccessibleLead(context, input.leadId);
      const result = await advanceLeadStatus({
        tenantId: context.ctx.tenantId,
        workspaceId: context.ctx.workspaceId,
        actorId: context.ctx.userId,
        leadId: input.leadId,
        status: input.status,
        closedDealAmount: input.closedDealAmount,
        source: "agent",
      });
      const output = { ok: true, leadId: input.leadId, status: result.status };
      await logToolAction({
        context,
        actionType: "updateLeadStatus",
        payload: input,
        result: output,
      });
      return output;
    },
  });
}
