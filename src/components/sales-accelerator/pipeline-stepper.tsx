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
          "flex items-center gap-2 whitespace-nowrap rounded-[20px] text-[12.5px] font-semibold",
          active ? "bg-ish-black px-[18px] py-2.5 text-white" : "bg-white/50 px-3.5 py-2.5 text-ish-ink-soft",
        )}
      >
        {active ? (
          <Loader2 className="size-4 animate-spin text-white/80" />
        ) : done ? (
          <Check className="size-3.5" />
        ) : (
          <Lock className="size-3.5" />
        )}
        {label}
      </div>
      {!isLast && <div className="mx-2 h-px w-5 shrink-0 bg-ish-ink/10" />}
    </div>
  );
}

export function PipelineStepper({ stage }: Props) {
  return (
    <div className="border-t border-black/[0.06] px-[22px] pb-[18px] pt-3">
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
