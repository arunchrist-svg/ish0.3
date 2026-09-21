import { isInboundEmailKind } from "@/lib/email/inbound-match";

export function isOutboundCampaignLogRow(row: {
  emailKind?: string | null;
  sequenceDay: number;
  status?: string | null;
}): boolean {
  if (row.status && row.status !== "sent") return false;
  if (isInboundEmailKind(row.emailKind)) return false;
  if (row.sequenceDay >= 0) return true;
  return row.emailKind === "outbound_reply";
}

export function autopilotRunOutboxLabel(run: {
  input?: { cities?: string[] | null } | null;
  progress?: { leadsSaved?: number | null } | null;
}): string {
  const cities = (run.input?.cities ?? []).map((city) => city.trim()).filter(Boolean);
  const area = cities[0] || "Autopilot run";
  const extra = cities.length > 1 ? ` +${cities.length - 1}` : "";
  const leads = run.progress?.leadsSaved;
  if (typeof leads === "number" && leads > 0) return `${area}${extra} · ${leads} leads`;
  return `${area}${extra}`;
}
