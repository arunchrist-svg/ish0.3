export type RolePlaybookEntry = {
  id: string;
  match: RegExp;
  rolesLabel: string;
  dailyWork: string;
};

export const ROLE_PLAYBOOK: RolePlaybookEntry[] = [
  {
    id: "hr",
    match: /\b(hr|chro|people|talent|human resources|l&d|learning)\b/i,
    rolesLabel: "HR / people leaders and the teams they gift for",
    dailyWork:
      "festival calendars, employee culture gifting, and getting boxes to office plus shop-floor or campus teams on time",
  },
  {
    id: "admin",
    match: /\b(admin|office manager|facilities|ehs|operations head)\b/i,
    rolesLabel: "admin and office operations",
    dailyWork: "logistics, desk delivery, vendor coordination, and keeping festive gifting on schedule",
  },
  {
    id: "procurement",
    match: /\b(procurement|purchase|sourcing|vendor|commercial|category)\b/i,
    rolesLabel: "procurement and vendor managers",
    dailyWork: "empanelment, compliance paperwork, rate cards, and reliable festive fulfilment",
  },
  {
    id: "md",
    match: /\b(md|ceo|founder|managing director|owner|promoter|president)\b/i,
    rolesLabel: "founders and managing directors",
    dailyWork: "client relationships, brand reputation, and personal festive gestures that represent the company",
  },
  {
    id: "engineering",
    match: /\b(cto|engineer|engineering|developer|product|design|r&d)\b/i,
    rolesLabel: "engineering, product, and design teams",
    dailyWork: "late project pushes, campus or lab intensity, and a short festive pause after shipping",
  },
];

export function resolveRolePlaybook(title?: string | null): RolePlaybookEntry {
  const t = title?.trim() || "";
  const hit = ROLE_PLAYBOOK.find((entry) => entry.match.test(t));
  if (hit) return hit;
  return {
    id: "unknown",
    match: /$^/,
    rolesLabel: "unknown role",
    dailyWork: "their team's day-to-day work and the people they look after at festival time",
  };
}
