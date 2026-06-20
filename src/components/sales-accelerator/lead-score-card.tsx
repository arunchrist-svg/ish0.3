import { ArrowUpRight, MoreHorizontal, TrendingUp } from "lucide-react";
import type { LeadRecord, QueueItem } from "@/lib/data";
import { getScoreGrade } from "@/lib/data";
import { CircleButton, PanelCard, ScoreGauge, SectionHeader } from "@/design-system";

type Props = {
  record: LeadRecord;
  current: QueueItem;
};

export function LeadScoreCard({ record, current }: Props) {
  const grade = getScoreGrade(current.score);

  return (
    <PanelCard tone="green">
      <SectionHeader
        title="Lead Score"
        className="mb-2.5"
        actions={
          <div className="flex gap-1.5">
            <CircleButton size={28}><MoreHorizontal className="size-3.5" /></CircleButton>
            <CircleButton size={28}><ArrowUpRight className="size-3.5" /></CircleButton>
          </div>
        }
      />
      <ScoreGauge score={current.score} />
      <div className="-mt-1.5 mb-4 flex items-center justify-center gap-2">
        <span className="text-[13px] font-bold text-ish-ink">Grade {grade}</span>
        <span className="rounded-lg bg-ish-green/20 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1f8050]">
          → {record.score.trend}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {record.score.factors.map((f) => (
          <div key={f.bold} className="flex items-start gap-2">
            <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-ish-green" />
            <div className="text-[12.5px] leading-relaxed text-ish-ink">
              {f.label} <b>{f.bold}</b>
            </div>
          </div>
        ))}
      </div>
    </PanelCard>
  );
}
