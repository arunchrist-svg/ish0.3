import type { CampaignMode } from "@/lib/email/config";
import type { CompanyOverview, DetectedOccasion } from "@/lib/company-overview";
import {
  FESTIVE_OCCASION_SENTINEL,
  occasionFromCampaignMode,
  type OccasionId,
  type WriteOccasionId,
  isOccasionId,
  getOccasion,
} from "./catalog";

const ACCOUNT_EVENT = "account_event";

export function latestDetectedOccasion(overview?: CompanyOverview | null): DetectedOccasion | null {
  const list = overview?.detectedOccasions?.filter((o) => o.type) ?? [];
  if (!list.length) return null;
  return list[list.length - 1] ?? null;
}

export function resolveWriteOccasion(params: {
  selected?: string | null;
  overview?: CompanyOverview | null;
  campaignMode?: CampaignMode | string | null;
}): WriteOccasionId | null {
  const selected = params.selected?.trim();
  if (selected && selected !== ACCOUNT_EVENT) {
    if (selected === FESTIVE_OCCASION_SENTINEL) return FESTIVE_OCCASION_SENTINEL;
    if (isOccasionId(selected)) return selected;
  }

  if (!selected || selected === ACCOUNT_EVENT) {
    const detected = latestDetectedOccasion(params.overview);
    if (detected?.type && isOccasionId(detected.type)) return detected.type;
    if (selected === ACCOUNT_EVENT) {
      return occasionFromCampaignMode(params.campaignMode);
    }
  }

  return occasionFromCampaignMode(params.campaignMode);
}

export function writeOccasionLabel(id?: WriteOccasionId | null): string {
  if (!id || id === FESTIVE_OCCASION_SENTINEL) return "Festive gifting";
  return getOccasion(id)?.label ?? id;
}

export function writeOccasionPitch(id?: WriteOccasionId | null): string {
  if (!id || id === FESTIVE_OCCASION_SENTINEL) {
    return "Seasonal employee and client boxes";
  }
  return getOccasion(id)?.pitch ?? "";
}

export function isYearRoundWriteOccasion(id?: WriteOccasionId | null): boolean {
  return Boolean(id && id !== FESTIVE_OCCASION_SENTINEL);
}

export function occasionDynamicsLine(
  id: WriteOccasionId | null | undefined,
  detected?: DetectedOccasion | null,
): string | null {
  if (detected?.label) {
    const loc = detected.location ? ` in ${detected.location}` : "";
    const when = detected.timeframe ? ` (${detected.timeframe})` : "";
    const soon = detected.timing === "upcoming" ? " upcoming" : "";
    return `${detected.label}${loc}${when}${soon}`.trim();
  }
  const def = id && id !== FESTIVE_OCCASION_SENTINEL ? getOccasion(id) : null;
  if (def) return `${def.label}: ${def.pitch}`;
  if (!id || id === FESTIVE_OCCASION_SENTINEL) return null;
  return null;
}

export type { OccasionId, WriteOccasionId };
