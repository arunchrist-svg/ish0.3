import { Building2, Lightbulb, MapPin } from "lucide-react";
import type { Company } from "@/lib/scouting-data";
import { PanelCard, SectionHeader, MetaField, ScoreGauge } from "@/design-system";

type Props = { company: Company };

export function CompanyDetailPanel({ company }: Props) {
  return (
    <PanelCard tone="white" className="flex h-full flex-col gap-4 overflow-y-auto rounded-none p-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 text-[40px] leading-none">{company.logo}</div>
          <div className="text-[18px] font-bold text-ish-ink">{company.name}</div>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ish-ink-soft">
            <Building2 className="size-3.5 shrink-0" />
            <span>{company.type}</span>
            <span className="text-ish-border">·</span>
            <MapPin className="size-3.5 shrink-0" />
            <span>{company.city}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1">
          <ScoreGauge score={company.giftScore} size="md" background />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
            Gift Score
          </span>
        </div>
      </div>

      {/* Stats row — PanelCard tone="yellow" mini-cards */}
      <div>
        <SectionHeader title="Company Overview" size="card" className="mb-2" />
        <div className="grid grid-cols-3 gap-2">
          <PanelCard tone="yellow" className="p-3 text-center">
            <MetaField label="Revenue" value={company.revenue} />
          </PanelCard>
          <PanelCard tone="yellow" className="p-3 text-center">
            <MetaField label="Founded" value={String(company.founded)} />
          </PanelCard>
          <PanelCard tone="yellow" className="p-3 text-center">
            <MetaField label="Employees" value={company.employees} />
          </PanelCard>
        </div>
      </div>

      {/* Gift Budget — PanelCard tone="green" */}
      <PanelCard tone="green" className="p-4">
        <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ish-ink-faint">
          Est. Gift Budget
        </div>
        <div className="text-[17px] font-bold text-ish-ink">{company.giftBudget}</div>
      </PanelCard>

      {/* Past Gifting */}
      <div>
        <SectionHeader title="Past Gifting" size="card" className="mb-2" />
        <div className="flex flex-col gap-2">
          {company.pastGifting.map((g, i) => (
            <PanelCard key={i} tone="pink" className="flex items-start gap-2.5 p-3">
              <span className="mt-0.5 shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-ish-ink-soft">
                {g.year}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-ish-ink">{g.occasion}</div>
                <div className="text-[11px] text-ish-ink-soft">{g.items}</div>
              </div>
              <span className="shrink-0 text-[11.5px] font-bold text-ish-ink">{g.perPerson}</span>
            </PanelCard>
          ))}
        </div>
      </div>

      {/* Intelligence Notes — PanelCard tone="yellow" */}
      <PanelCard tone="yellow" className="p-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ish-ink-faint">
          <Lightbulb className="size-3.5" />
          Intelligence
        </div>
        <p className="text-[12px] italic leading-relaxed text-ish-ink-soft">
          {company.intelligenceNotes}
        </p>
      </PanelCard>
    </PanelCard>
  );
}
