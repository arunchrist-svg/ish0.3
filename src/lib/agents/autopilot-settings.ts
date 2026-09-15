import type { AutopilotSchedule } from "@/db";
import type { AutopilotRunSettings } from "@/lib/agents/autopilot";

export type AutopilotSettingsBody = {
  cities?: string[];
  industries?: string[];
  businesses?: string[];
  employeeBands?: string[];
  seniority?: string[];
  departments?: string[];
  locationScope?: "focus" | "interest";
  outreachTemplate?: string;
  schedule?: Partial<AutopilotSchedule> | null;
  autoSend?: boolean;
  runNow?: boolean;
};

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function parseAutopilotSettingsBody(body: AutopilotSettingsBody): AutopilotRunSettings {
  return {
    cities: stringList(body.cities),
    industries: stringList(body.industries),
    businesses: stringList(body.businesses),
    employeeBands: stringList(body.employeeBands),
    seniority: Array.isArray(body.seniority)
      ? body.seniority.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : undefined,
    departments: Array.isArray(body.departments)
      ? body.departments.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : undefined,
    locationScope: body.locationScope === "interest" ? "interest" : body.locationScope === "focus" ? "focus" : undefined,
    outreachTemplate: typeof body.outreachTemplate === "string" ? body.outreachTemplate : undefined,
    schedule: body.schedule ?? undefined,
    autoSend: typeof body.autoSend === "boolean" ? body.autoSend : undefined,
    runNow: typeof body.runNow === "boolean" ? body.runNow : undefined,
  };
}
