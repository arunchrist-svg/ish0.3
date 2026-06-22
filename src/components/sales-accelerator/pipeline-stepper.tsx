import { ChevronLeft, ChevronRight, Check, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/data";
import { CircleButton } from "@/design-system";

type Props = {
  stage: number;
};

function StageNode({ label, active, done, isLast }: { label: string; active: boolean; done: boolean; isLast: boolean }) {
  return (
    <div className={cn("flex items-center", isLast ? "shrink-0" : "flex-1")}>
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
      {!isLast && <div className="min-w-4 flex-1 bg-ish-ink/10 h-px" />}
    </div>
  );
}

export function PipelineStepper({ stage }: Props) {
  return (
    <div className="flex items-center gap-0 rounded-b-[22px] bg-ish-yellow-gradient px-[22px] pt-[22px] pb-[22px]">
      <CircleButton size={28}><ChevronLeft className="size-3.5" /></CircleButton>
      <div className="flex flex-1 items-center gap-2 overflow-hidden px-2.5">
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
      <CircleButton size={28}><ChevronRight className="size-3.5" /></CircleButton>
    </div>
  );
}
