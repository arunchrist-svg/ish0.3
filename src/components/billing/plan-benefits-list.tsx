import {
  formatCapacity,
  getPlanCapacity,
  type PlanDefinition,
} from "@/lib/billing/plan-catalog";

type PlanBenefitsListProps = {
  plan: PlanDefinition;
  compact?: boolean;
};

export function PlanBenefitsList({ plan, compact = false }: PlanBenefitsListProps) {
  const capacity = getPlanCapacity(plan.includedCredits);

  const capacityLines = plan.features.liveSend
    ? [
        `Up to ${formatCapacity(capacity.contactsScouted)} accounts scouted per month`,
        `Up to ${formatCapacity(capacity.aiDraftAndSendEmails)} AI-written emails sent per month`,
      ]
    : [
        `Up to ${formatCapacity(capacity.contactsScouted)} accounts scouted per month`,
        `Up to ${formatCapacity(capacity.aiDraftsOnly)} AI email drafts per month`,
        "Live sends unlock on Growth and Scale",
      ];

  return (
    <div className={compact ? "mt-3 space-y-2" : "mt-5 space-y-4"}>
      {!compact ? (
        <p className="text-sm text-ish-ink-soft">{plan.bestFor}</p>
      ) : null}

      <ul className={`space-y-1.5 text-ish-ink-soft ${compact ? "text-xs" : "text-sm"}`}>
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ish-black/70" />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div className={`rounded-xl bg-ish-canvas/80 ${compact ? "p-2.5" : "p-3.5"}`}>
        <p className={`font-semibold text-ish-ink ${compact ? "text-[11px]" : "text-xs"}`}>
          Monthly capacity with {formatCapacity(plan.includedCredits)} credits
        </p>
        <ul className={`mt-1.5 space-y-1 text-ish-ink-soft ${compact ? "text-[11px]" : "text-xs"}`}>
          {capacityLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>{formatCapacity(plan.seatLimit)} team seats · {plan.features.maxScoutContacts} contacts per scout run</li>
        </ul>
      </div>
    </div>
  );
}
