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
    <PanelCard tone="green" className="flex h-full flex-col">
      <SectionHeader
        title="Lead Score"
        className="mb-3"
        actions={
          <div className="flex gap-1.5">
            <CircleButton size={28}><MoreHorizontal className="size-3.5" /></CircleButton>
            <CircleButton size={28}><ArrowUpRight className="size-3.5" /></CircleButton>
          </div>
        }
      />
      <div className="flex flex-1 items-center gap-3.5">
        <div className="flex w-[108px] shrink-0 flex-col items-start gap-2.5">
          <ScoreGauge score={current.score} size="card" background />
          <div className="flex w-full flex-col gap-1.5">
            <span className="text-[13px] font-bold leading-none text-ish-ink">Grade {grade}</span>
            <span className="w-fit rounded-lg bg-ish-green/20 px-2.5 py-0.5 text-[11.5px] font-semibold leading-none text-[#1f8050]">
              → {record.score.trend}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
          {record.score.factors.map((f) => (
            <div key={f.bold} className="flex items-start gap-2">
              <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-ish-green" />
              <div className="text-[12.5px] leading-snug text-ish-ink">
                {f.label} <b>{f.bold}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelCard>
  );
}
