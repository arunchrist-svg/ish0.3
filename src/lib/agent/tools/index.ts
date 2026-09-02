import { createEnrichContactTool } from "./enrich-contact";
import { createScheduleCadenceTool } from "./schedule-cadence";
import { createUpdateLeadStatusTool } from "./update-lead-status";
import type { AgentToolContext } from "./types";

export function createAgentTools(context: AgentToolContext) {
  return {
    updateLeadStatus: createUpdateLeadStatusTool(context),
    scheduleCadence: createScheduleCadenceTool(context),
    enrichContact: createEnrichContactTool(context),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
export type { AgentToolContext } from "./types";
export { enrichContactInput } from "./enrich-contact";
export { scheduleCadenceInput } from "./schedule-cadence";
export { updateLeadStatusInput } from "./update-lead-status";
