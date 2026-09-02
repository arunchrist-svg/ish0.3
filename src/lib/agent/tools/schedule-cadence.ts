import { tool } from "ai";
import { z } from "zod";
import { controlLeadSequence } from "@/lib/outreach/sequence-control";
import { requireAccessibleLead } from "./access";
import { logToolAction } from "./logging";
import type { AgentToolContext } from "./types";

export const scheduleCadenceInput = z.object({
  leadId: z.string().uuid().describe("The CRM lead ID whose follow-up cadence should change"),
  action: z
    .enum(["start", "pause", "cancel", "reset"])
    .describe("The cadence action to perform"),
});

export function createScheduleCadenceTool(context: AgentToolContext) {
  return tool({
    description:
      "Start, pause, cancel, or reset the existing follow-up cadence for an accessible lead. This never sends an email immediately.",
    inputSchema: scheduleCadenceInput,
    execute: async (input) => {
      await requireAccessibleLead(context, input.leadId);
      const result = await controlLeadSequence({
        leadId: input.leadId,
        action: input.action,
        tenantId: context.ctx.tenantId,
        workspaceId: context.ctx.workspaceId,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      const output = {
        ok: true,
        leadId: input.leadId,
        state: result.state,
        updated: result.updated,
      };
      await logToolAction({
        context,
        actionType: "scheduleCadence",
        payload: input,
        result: output,
      });
      return output;
    },
  });
}
