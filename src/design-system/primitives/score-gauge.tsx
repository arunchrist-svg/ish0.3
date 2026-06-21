import { cn } from "@/lib/utils";

const SIZE_CONFIG = {
  sm: { size: 44, r: 15, tick: 4, strokeWidth: 2.5, fontSize: 11 },
  md: { size: 72, r: 25, tick: 5, strokeWidth: 3, fontSize: 18 },
  card: { size: 108, r: 42, tick: 6, strokeWidth: 3.5, fontSize: 30 },
  lg: { size: 170, r: 70, tick: 8, strokeWidth: 4, fontSize: 46 },
} as const;

type ScoreGaugeSize = keyof typeof SIZE_CONFIG;

function getFilledColor(score: number) {
  if (score >= 75) return "#3FBE82";
  if (score >= 50) return "#E8A000";
  return "#E57373";
}

type Props = {
  score: number;
  size?: ScoreGaugeSize;
  className?: string;
  /** Soft mint backdrop like scouting cards */
  background?: boolean;
};

export function ScoreGauge({
  score,
  size = "lg",
  className,
  background = false,
}: Props) {
  const { size: dim, r, tick, strokeWidth, fontSize } = SIZE_CONFIG[size];
  const center = dim / 2;
  const segments = 40;
  const filled = Math.round((Math.min(100, Math.max(0, score)) / 100) * segments);
  const filledColor = getFilledColor(score);

  const gauge = (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: dim, height: dim }}
      aria-label={`Score ${score}`}
    >
      <svg width={dim} height={dim} className="-rotate-90">
        {Array.from({ length: segments }).map((_, i) => {
          const angle = (360 / segments) * i;
          const rad = (angle * Math.PI) / 180;
          const x1 = center + (r - tick) * Math.cos(rad);
          const y1 = center + (r - tick) * Math.sin(rad);
          const x2 = center + (r + tick) * Math.cos(rad);
          const y2 = center + (r + tick) * Math.sin(rad);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i < filled ? filledColor : "#E5E4E8"}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-extrabold leading-none text-ish-ink"
          style={{ fontSize }}
        >
          {score}
        </span>
      </div>
    </div>
  );

  if (!background) return gauge;

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-ish-green-soft/50 p-1"
      style={{ width: dim + 8, height: dim + 8 }}
    >
      {gauge}
    </div>
  );
}
