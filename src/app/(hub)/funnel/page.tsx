"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STAGE_ORDER = [
  "scouted", "prefiltered", "researched", "draft_ready",
  "approved", "outreached", "replied", "meeting", "po_closed",
];

const STAGE_LABELS: Record<string, string> = {
  scouted: "Scouted",
  prefiltered: "Pre-filtered",
  researched: "Researched",
  draft_ready: "Draft Ready",
  approved: "Approved",
  outreached: "Outreached",
  replied: "Replied",
  meeting: "Meeting",
  po_closed: "PO Closed",
};

type FunnelData = {
  stages: { stage: string; count: number }[];
  emailAccuracy: {
    totalRuns: number;
    withEmail: number;
    verified: number;
    emailFoundRate: number;
    verifyRate: number;
  };
  leadStatuses: { status: string; count: number }[];
};

export default function FunnelPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/funnel")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const stageMap = new Map(data?.stages.map((s) => [s.stage, s.count]) ?? []);
  const maxCount = Math.max(...Array.from(stageMap.values()), 1);

  return (
        <div className="min-w-0 flex-1 overflow-y-auto bg-ish-app p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-ish-ink">Yield Funnel</h1>
            <p className="mt-1 text-[13px] text-ish-ink-soft">Lead progression across all stages</p>
          </div>

          {loading ? (
            <div className="text-[13px] text-ish-ink-faint">Loading…</div>
          ) : (
            <>
              {/* Funnel chart */}
              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-ish-sm)]">
                <h2 className="mb-5 text-[15px] font-bold text-ish-ink">Pipeline Funnel</h2>
                <div className="space-y-3">
                  {STAGE_ORDER.map((stage) => {
                    const count = stageMap.get(stage) ?? 0;
                    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                    return (
                      <div key={stage} className="flex items-center gap-4">
                        <div className="w-28 text-right text-[12px] font-semibold text-ish-ink-soft">
                          {STAGE_LABELS[stage] ?? stage}
                        </div>
                        <div className="flex-1 overflow-hidden rounded-full bg-ish-app">
                          <div
                            className={cn(
                              "h-7 rounded-full transition-all duration-500",
                              count > 0 ? "bg-ish-yellow" : "bg-ish-border",
                            )}
                            style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-[13px] font-bold text-ish-ink">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Email Accuracy KPIs */}
              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-ish-sm)]">
                <h2 className="mb-5 text-[15px] font-bold text-ish-ink">Email Accuracy</h2>
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: "Enrichment Runs", value: data?.emailAccuracy.totalRuns ?? 0 },
                    { label: "With Email", value: data?.emailAccuracy.withEmail ?? 0 },
                    { label: "Verified", value: data?.emailAccuracy.verified ?? 0 },
                    { label: "Email Found Rate", value: `${data?.emailAccuracy.emailFoundRate ?? 0}%` },
                    { label: "Verify Rate", value: `${data?.emailAccuracy.verifyRate ?? 0}%` },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-[16px] bg-ish-app p-4 text-center">
                      <div className="text-[24px] font-bold text-ish-ink">{kpi.value}</div>
                      <div className="mt-1 text-[11px] text-ish-ink-faint">{kpi.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lead Status Table */}
              <div className="rounded-[24px] bg-white p-6 shadow-[var(--shadow-ish-sm)]">
                <h2 className="mb-4 text-[15px] font-bold text-ish-ink">Lead Status Breakdown</h2>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-ish-border">
                      <th className="pb-2 text-left font-semibold text-ish-ink-soft">Status</th>
                      <th className="pb-2 text-right font-semibold text-ish-ink-soft">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.leadStatuses ?? []).map((row) => (
                      <tr key={row.status} className="border-b border-ish-border/50">
                        <td className="py-2.5 capitalize text-ish-ink">{row.status.replace("_", " ")}</td>
                        <td className="py-2.5 text-right font-bold text-ish-ink">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
  );
}
