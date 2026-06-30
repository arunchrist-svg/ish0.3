import { Check, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/data";

type Props = {
  stage: number;
};

function StageNode({ label, active, done, isLast }: { label: string; active: boolean; done: boolean; isLast: boolean }) {
  return (
    <div className="flex shrink-0 items-center">
      <div
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap rounded-[14px] text-[11px] font-semibold lg:gap-2 lg:rounded-[20px] lg:text-[12.5px]",
          active
            ? "bg-ish-black px-2.5 py-1.5 text-white lg:px-[18px] lg:py-2.5"
            : "bg-white/50 px-2 py-1.5 text-ish-ink-soft lg:px-3.5 lg:py-2.5",
        )}
      >
        {active ? (
          <Loader2 className="size-3 animate-spin text-white/80 lg:size-4" />
        ) : done ? (
          <Check className="size-3 lg:size-3.5" />
        ) : (
          <Lock className="size-3 lg:size-3.5" />
        )}
        {label}
      </div>
      {!isLast && <div className="mx-1 h-px w-3 shrink-0 bg-ish-ink/10 lg:mx-2 lg:w-5" />}
    </div>
  );
}

export function PipelineStepper({ stage }: Props) {
  return (
    <div className="border-t border-black/[0.06] px-3 pb-2 pt-1.5 lg:px-[22px] lg:pb-[18px] lg:pt-3">
      <div className="flex min-w-0 items-center overflow-x-auto scrollbar-none">
        {STAGES.map((s, i) => (
          <StageNode
            key={s}
            label={i === stage ? `${s} (3 D)` : s}
            active={i === stage}
            done={i < stage}
            isLast={i === STAGES.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
