export type LeadabilityBand = "high" | "medium" | "low" | "unknown";

export type LeadabilityMeta = {
  leadabilityBand?: LeadabilityBand;
  leadabilityScore?: number;
  leadabilityMatchedPeople?: number;
  leadabilityMatchedInCity?: number;
  leadabilityProbeSource?: string;
};

export function getLeadabilityLabel(band?: LeadabilityBand): string | null {
  switch (band) {
    case "high":
      return "High lead chance";
    case "medium":
      return "Medium lead chance";
    case "low":
      return "Low lead chance";
    default:
      return null;
  }
}

export function getLeadabilitySummary(meta: LeadabilityMeta): string | null {
  const matchedPeople = meta.leadabilityMatchedPeople ?? 0;
  const matchedInCity = meta.leadabilityMatchedInCity ?? 0;

  if (matchedPeople > 0 && matchedInCity > 0) {
    return `${matchedPeople} matching ${matchedPeople === 1 ? "buyer" : "buyers"}, ${matchedInCity} in city`;
  }
  if (matchedPeople > 0) {
    return `${matchedPeople} matching ${matchedPeople === 1 ? "buyer" : "buyers"} found`;
  }
  if (matchedInCity > 0) {
    return `${matchedInCity} local ${matchedInCity === 1 ? "signal" : "signals"} found`;
  }
  if (typeof meta.leadabilityScore === "number" && meta.leadabilityBand && meta.leadabilityBand !== "unknown") {
    return `Leadability score ${Math.round(meta.leadabilityScore)}`;
  }
  return null;
}

export function getLeadabilityTooltip(meta: LeadabilityMeta): string | null {
  const label = getLeadabilityLabel(meta.leadabilityBand);
  if (!label) return null;
  const summary = getLeadabilitySummary(meta);
  const source = meta.leadabilityProbeSource ? `Source: ${meta.leadabilityProbeSource}` : null;
  return [label, summary, source].filter(Boolean).join(". ");
}
