import { cn } from "@/lib/utils";
import { getScoreTone, scoreToneClasses } from "@/design-system/tokens";

export function ScoreBadge({ score }: { score: number }) {
  const tone = getScoreTone(score);

  return (
    <div
      className={cn(
        "flex size-[38px] shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
        scoreToneClasses[tone],
      )}
    >
      {score}
    </div>
  );
}
