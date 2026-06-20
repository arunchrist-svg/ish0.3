export function ScoreGauge({ score }: { score: number }) {
  const r = 70;
  const segments = 40;
  const filled = Math.round((score / 100) * segments);

  return (
    <div className="relative mx-auto size-[170px]">
      <svg width="170" height="170" className="-rotate-90">
        {Array.from({ length: segments }).map((_, i) => {
          const angle = (360 / segments) * i;
          const rad = (angle * Math.PI) / 180;
          const x1 = 85 + (r - 8) * Math.cos(rad);
          const y1 = 85 + (r - 8) * Math.sin(rad);
          const x2 = 85 + (r + 8) * Math.cos(rad);
          const y2 = 85 + (r + 8) * Math.sin(rad);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i < filled ? "#3FBE82" : "#E5E4E8"}
              strokeWidth="4"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[46px] font-extrabold leading-none text-ish-ink">{score}</div>
      </div>
    </div>
  );
}
