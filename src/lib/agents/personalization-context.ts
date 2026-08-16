import type { CompanyOverview } from "@/lib/company-overview";
import { resolveRolePlaybook } from "@/lib/email/role-playbook";
import { latestDetectedOccasion, occasionDynamicsLine, resolveWriteOccasion } from "@/lib/occasions/resolve";
import { FESTIVE_OCCASION_SENTINEL } from "@/lib/occasions/catalog";

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
  occasionTheme?: string | null;
  icpSummary?: string | null;
};

function campaignDynamics(mode?: string | null): string | null {
  if (!mode) return null;
  if (mode === "diwali_gifting") {
    return "Diwali corporate gifting window: teams lock vendors weeks before the festival";
  }
  if (mode === "year_round") {
    return "Year-round programs: birthdays, new joiners, pantry, openings, and vendor empanelment";
  }
  if (mode === "mass_ordering") return "Bulk festive or welfare orders for the full team";
  if (mode === "festival_bundle") return "Seasonal festival bundle planning";
  return null;
}

export function buildPersonalizationContext(input: PersonalizationContextInput): PersonalizationContext {
  const industry = input.industry?.trim() || "Corporate";
  const role = resolveRolePlaybook(input.contactTitle);
  const title = input.contactTitle?.trim();
  const occasion = resolveWriteOccasion({
    selected: input.occasionTheme,
    overview: input.overview,
    campaignMode: input.campaignMode,
  });
  const detected = latestDetectedOccasion(input.overview);

  const dynamics: string[] = [];
  const occasionLine = occasionDynamicsLine(occasion, detected);
  if (occasionLine) dynamics.push(occasionLine);
  if (
    input.overview?.nextGiftingCalendarCycle?.trim() &&
    occasionLine !== input.overview.nextGiftingCalendarCycle.trim()
  ) {
    dynamics.push(input.overview.nextGiftingCalendarCycle.trim());
  }
  if (input.overview?.corporateMilestones?.length) {
    dynamics.push(input.overview.corporateMilestones.slice(0, 2).join("; "));
  }
  const campaign = campaignDynamics(input.campaignMode);
  if (campaign && occasion && occasion !== FESTIVE_OCCASION_SENTINEL) {
    if (input.campaignMode === "year_round" || input.campaignMode === "mass_ordering") {
      dynamics.push(campaign);
    }
  } else if (campaign) {
    dynamics.push(campaign);
  }
  if (input.campaignNotes?.trim()) dynamics.push(input.campaignNotes.trim().slice(0, 180));
  if (input.icpSummary?.trim()) dynamics.push(`Seller targets: ${input.icpSummary.trim().slice(0, 220)}`);
  if (input.city?.trim()) dynamics.push(`${input.city.trim()} market`);
  if (!dynamics.length) {
    dynamics.push(
      occasion && occasion !== FESTIVE_OCCASION_SENTINEL
        ? "Year-round corporate sweets programs"
        : "Standard corporate festive gifting cycle",
    );
  }

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
  if (input.overview?.detectedOccasions?.length) {
    const occ = input.overview.detectedOccasions
      .slice(-2)
      .map((o) =>
        [o.timing === "upcoming" ? "upcoming" : null, o.label || o.type, o.location, o.timeframe]
          .filter(Boolean)
          .join(" "),
      )
      .filter(Boolean);
    if (occ.length) profile.push(`Detected occasions: ${occ.join("; ")}`);
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
