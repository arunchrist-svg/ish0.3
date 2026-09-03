"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { AppPageHeader } from "@/design-system";
import { cn } from "@/lib/utils";
import type { SeasonWarRoomData } from "@/app/api/season/route";

const WEEK_COLORS = {
  outreached: "bg-brand-yellow",
  replied: "bg-amber-400",
  meeting: "bg-orange-400",
  closed: "bg-green-500",
};

function fmt(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n.toFixed(0)}`;
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.min(Math.round((a / b) * 100), 100);
}

export default function SeasonWarRoomPage() {
  const [data, setData] = useState<SeasonWarRoomData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/season")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const bookedPct = pct(data?.booked ?? 0, data?.target ?? 0);
  const capacityPct = pct(data?.bookedBoxes ?? 0, data?.capacity ?? 0);
  const maxWeekTotal = Math.max(
    ...(data?.weeklyPipeline ?? []).map(
      (w) => w.outreached + w.replied + w.meeting + w.closed,
    ),
    1,
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageHeader
        icon={Flame}
        title={data?.season ? `Season War Room · ${data.season}` : "Season War Room"}
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-transparent p-8">
        {loading ? (
          <div className="text-[13px] text-brand-ink-faint">Loading…</div>
        ) : (
          <>
            {/* Revenue vs Target */}
            <div className="mb-6 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
              <h2 className="mb-4 text-[15px] font-bold text-brand-ink">Revenue booked</h2>
              <div className="mb-3 flex items-end justify-between">
                <span className="text-[32px] font-bold text-brand-ink">{fmt(data?.booked ?? 0)}</span>
                {(data?.target ?? 0) > 0 && (
                  <span className="text-[13px] text-brand-ink-faint">
                    Target {fmt(data!.target)} · {bookedPct}%
                  </span>
                )}
              </div>
              {(data?.target ?? 0) > 0 && (
                <div className="h-4 w-full overflow-hidden rounded-full bg-brand-app">
                  <div
                    className="h-4 rounded-full bg-brand-yellow transition-all duration-700"
                    style={{ width: `${bookedPct}%` }}
                  />
                </div>
              )}
            </div>

            {/* Capacity burn-down */}
            {(data?.capacity ?? 0) > 0 && (
              <div className="mb-6 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-4 text-[15px] font-bold text-brand-ink">Production capacity</h2>
                <div className="mb-3 flex items-end justify-between">
                  <span className="text-[32px] font-bold text-brand-ink">
                    {(data!.capacity - data!.bookedBoxes).toLocaleString()}
                    <span className="ml-1 text-[16px] font-normal text-brand-ink-soft">slots left</span>
                  </span>
                  <span className="text-[13px] text-brand-ink-faint">
                    {capacityPct}% filled · {data!.capacity.toLocaleString()} total
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-brand-app">
                  <div
                    className={cn(
                      "h-4 rounded-full transition-all duration-700",
                      capacityPct >= 90 ? "bg-red-500" : capacityPct >= 70 ? "bg-orange-400" : "bg-green-500",
                    )}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Weekly pipeline */}
            {(data?.weeklyPipeline ?? []).length > 0 && (
              <div className="mb-6 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-1 text-[15px] font-bold text-brand-ink">Pipeline by week</h2>
                <div className="mb-4 flex gap-4 text-[11px] text-brand-ink-faint">
                  {(["outreached", "replied", "meeting", "closed"] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1.5">
                      <span className={cn("inline-block h-2 w-2 rounded-full", WEEK_COLORS[k])} />
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </span>
                  ))}
                </div>
                <div className="space-y-2">
                  {data!.weeklyPipeline.map((week) => {
                    const total = week.outreached + week.replied + week.meeting + week.closed;
                    const rowPct = maxWeekTotal > 0 ? (total / maxWeekTotal) * 100 : 0;
                    const label = new Date(week.weekStart).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    });
                    return (
                      <div key={week.weekStart} className="flex items-center gap-3">
                        <div className="w-14 shrink-0 text-right text-[11px] text-brand-ink-faint">{label}</div>
                        <div className="flex h-6 flex-1 overflow-hidden rounded-full bg-brand-app">
                          {(["outreached", "replied", "meeting", "closed"] as const).map((k) => {
                            const segPct = total > 0 ? (week[k] / total) * rowPct : 0;
                            return segPct > 0 ? (
                              <div
                                key={k}
                                className={cn("h-6", WEEK_COLORS[k])}
                                style={{ width: `${segPct}%` }}
                                title={`${k}: ${week[k]}`}
                              />
                            ) : null;
                          })}
                        </div>
                        <div className="w-8 text-right text-[12px] font-bold text-brand-ink">{total}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rep leaderboard */}
            {(data?.leaderboard ?? []).length > 0 && (
              <div className="mb-6 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-4 text-[15px] font-bold text-brand-ink">Rep leaderboard</h2>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-brand-border">
                      <th className="pb-2 text-left font-semibold text-brand-ink-soft">#</th>
                      <th className="pb-2 text-left font-semibold text-brand-ink-soft">Rep</th>
                      <th className="pb-2 text-right font-semibold text-brand-ink-soft">POs closed</th>
                      <th className="pb-2 text-right font-semibold text-brand-ink-soft">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.leaderboard.map((row, i) => (
                      <tr key={row.userId} className="border-b border-brand-border/50">
                        <td className="py-2.5 text-brand-ink-faint">{i + 1}</td>
                        <td className="py-2.5 font-medium text-brand-ink">{row.name}</td>
                        <td className="py-2.5 text-right font-bold text-brand-ink">{row.closedCount}</td>
                        <td className="py-2.5 text-right text-brand-ink-soft">
                          {row.totalAmount > 0 ? fmt(row.totalAmount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty state */}
            {!loading &&
              (data?.leaderboard ?? []).length === 0 &&
              (data?.weeklyPipeline ?? []).length === 0 && (
                <div className="rounded-[24px] bg-white p-10 text-center shadow-[var(--shadow-brand-sm)]">
                  <p className="text-[14px] text-brand-ink-faint">
                    No season data yet — start scouting and sending to see this dashboard fill up.
                  </p>
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
