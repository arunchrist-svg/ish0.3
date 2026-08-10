import type { CompanyOverview } from "@/lib/company-overview";
import { resolveRolePlaybook } from "@/lib/email/role-playbook";

export type PersonalizationContext = {
  industry: string;
  marketDynamics: string;
  companyProfile: string;
  recipientRoles: string;
  roleDailyWork: string;
};

export type PersonalizationContextInput = {
  industry?: string | null;
  city?: string | null;
  accountName: string;
  contactTitle?: string | null;
  intelNotes?: string | null;
  overview?: CompanyOverview | null;
  campaignMode?: string | null;
  campaignNotes?: string | null;
  buyerPersonas?: string[];
  decisionChain?: string[] | null;
};

function campaignDynamics(mode?: string | null): string | null {
  if (!mode) return null;
  if (mode === "diwali_gifting") {
    return "Diwali corporate gifting window: teams lock vendors weeks before the festival";
  }
  if (mode === "mass_ordering") return "Bulk festive or welfare orders for the full team";
  if (mode === "festival_bundle") return "Seasonal festival bundle planning";
  return null;
}

export function buildPersonalizationContext(input: PersonalizationContextInput): PersonalizationContext {
  const industry = input.industry?.trim() || "Corporate";
  const role = resolveRolePlaybook(input.contactTitle);
  const title = input.contactTitle?.trim();

  const dynamics: string[] = [];
  if (input.overview?.nextGiftingCalendarCycle?.trim()) {
    dynamics.push(input.overview.nextGiftingCalendarCycle.trim());
  }
  if (input.overview?.corporateMilestones?.length) {
    dynamics.push(input.overview.corporateMilestones.slice(0, 2).join("; "));
  }
  const campaign = campaignDynamics(input.campaignMode);
  if (campaign) dynamics.push(campaign);
  if (input.campaignNotes?.trim()) dynamics.push(input.campaignNotes.trim().slice(0, 180));
  if (input.city?.trim()) dynamics.push(`${input.city.trim()} market`);
  if (!dynamics.length) dynamics.push("Standard corporate festive gifting cycle");

  const profile: string[] = [`${input.accountName}`];
  if (input.overview?.sector?.trim()) profile.push(input.overview.sector.trim());
  if (input.intelNotes?.trim()) profile.push(input.intelNotes.trim().slice(0, 220));
  if (input.overview?.intelligenceNotes?.trim() && input.overview.intelligenceNotes !== input.intelNotes) {
    profile.push(input.overview.intelligenceNotes.trim().slice(0, 160));
  }
  if (input.overview?.pastGiftingBrands?.length) {
    const past = input.overview.pastGiftingBrands
      .slice(0, 2)
      .map((b) => [b.occasion, b.items].filter(Boolean).join(" "))
      .filter(Boolean);
    if (past.length) profile.push(`Past gifting: ${past.join("; ")}`);
  }
  if (input.overview?.complianceRequirements?.trim()) {
    profile.push(`Compliance: ${input.overview.complianceRequirements.trim().slice(0, 120)}`);
  }
  if (profile.length === 1) profile.push("company profile details unknown");

  const personas = (input.buyerPersonas ?? []).slice(0, 3);
  const chain = (input.decisionChain ?? []).filter(Boolean).slice(0, 3);
  const rolesParts = [
    title || role.rolesLabel,
    personas.length ? `typical buyers: ${personas.join(", ")}` : null,
    chain.length ? `decision chain: ${chain.join(", ")}` : null,
  ].filter(Boolean);

  return {
    industry,
    marketDynamics: dynamics.join(". "),
    companyProfile: profile.join(". "),
    recipientRoles: rolesParts.join("; ") || "unknown role",
    roleDailyWork: role.dailyWork,
  };
}

export function formatPersonalizationContextForPrompt(ctx: PersonalizationContext): string {
  return `<CONTEXT_VARIABLES>
- DOMAIN/INDUSTRY: ${ctx.industry}
- MARKET DYNAMICS: ${ctx.marketDynamics}
- COMPANY PROFILE: ${ctx.companyProfile}
- RECIPIENT ROLES: ${ctx.recipientRoles}
- DAILY WORK: ${ctx.roleDailyWork}
</CONTEXT_VARIABLES>`;
}
