"use client";

import { useEffect, useState } from "react";
import { GitFork } from "lucide-react";
import { AppPageHeader } from "@/design-system";
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

type ScoutQualityData = {
  emptyCompanyRate: number;
  emptyCompanyRuns: number;
  companyRuns: number;
  emptyPeopleRuns: number;
  peopleRuns: number;
  goldDensity: number;
  savePrecisionProxy: number;
  saved: number;
  employerSkipped: number;
  skipReasons: { reason: string; count: number }[];
  learningActive: boolean;
  learningSamples: number;
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
  const [quality, setQuality] = useState<ScoutQualityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/funnel").then((r) => r.json()),
      fetch("/api/scout/quality?days=7").then((r) => r.json()).catch(() => null),
    ])
      .then(([funnel, scoutQuality]) => {
        setData(funnel);
        if (scoutQuality && !scoutQuality.error) setQuality(scoutQuality);
      })
      .finally(() => setLoading(false));
  }, []);

  const stageMap = new Map(data?.stages.map((s) => [s.stage, s.count]) ?? []);
  const maxCount = Math.max(...Array.from(stageMap.values()), 1);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageHeader
        icon={GitFork}
        title="Yield Funnel"
      />
      <div className="min-w-0 flex-1 overflow-y-auto bg-transparent p-8">
          {loading ? (
            <div className="text-[13px] text-brand-ink-faint">Loading…</div>
          ) : (
            <>
              {/* Funnel chart */}
              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-5 text-[15px] font-bold text-brand-ink">Pipeline Funnel</h2>
                <div className="space-y-3">
                  {STAGE_ORDER.map((stage) => {
                    const count = stageMap.get(stage) ?? 0;
                    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                    return (
                      <div key={stage} className="flex items-center gap-4">
                        <div className="w-28 text-right text-[12px] font-semibold text-brand-ink-soft">
                          {STAGE_LABELS[stage] ?? stage}
                        </div>
                        <div className="flex-1 overflow-hidden rounded-full bg-brand-app">
                          <div
                            className={cn(
                              "h-7 rounded-full transition-all duration-500",
                              count > 0 ? "bg-brand-yellow" : "bg-brand-border",
                            )}
                            style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-[13px] font-bold text-brand-ink">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Email Accuracy KPIs */}
              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-5 text-[15px] font-bold text-brand-ink">Email Accuracy</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                  {[
                    { label: "Enrichment Runs", value: data?.emailAccuracy.totalRuns ?? 0 },
                    { label: "With Email", value: data?.emailAccuracy.withEmail ?? 0 },
                    { label: "Verified", value: data?.emailAccuracy.verified ?? 0 },
                    { label: "Email Found Rate", value: `${data?.emailAccuracy.emailFoundRate ?? 0}%` },
                    { label: "Verify Rate", value: `${data?.emailAccuracy.verifyRate ?? 0}%` },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-[16px] bg-brand-app p-4 text-center">
                      <div className="text-[24px] font-bold text-brand-ink">{kpi.value}</div>
                      <div className="mt-1 text-[11px] text-brand-ink-faint">{kpi.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-5 text-[15px] font-bold text-brand-ink">Scout quality (7 days)</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                  {[
                    { label: "Empty company scouts", value: `${quality?.emptyCompanyRate ?? 0}%` },
                    { label: "Company runs", value: quality?.companyRuns ?? 0 },
                    { label: "Empty people runs", value: quality?.emptyPeopleRuns ?? 0 },
                    { label: "Gold density", value: `${quality?.goldDensity ?? 0}%` },
                    { label: "Save precision proxy", value: `${quality?.savePrecisionProxy ?? 0}%` },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-[16px] bg-brand-app p-4 text-center">
                      <div className="text-[24px] font-bold text-brand-ink">{kpi.value}</div>
                      <div className="mt-1 text-[11px] text-brand-ink-faint">{kpi.label}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[12px] text-brand-ink-faint">
                  Learning {quality?.learningActive ? "active" : "idle"}
                  {quality?.learningSamples ? ` · ${quality.learningSamples} outreached samples` : ""}.
                  Precision proxy is saved / (saved + employer skips).
                </p>
                {(quality?.skipReasons ?? []).length > 0 && (
                  <table className="mt-4 w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-brand-border">
                        <th className="pb-2 text-left font-semibold text-brand-ink-soft">Skip reason</th>
                        <th className="pb-2 text-right font-semibold text-brand-ink-soft">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quality!.skipReasons.map((row) => (
                        <tr key={row.reason} className="border-b border-brand-border/60">
                          <td className="py-2 text-brand-ink">{row.reason}</td>
                          <td className="py-2 text-right font-semibold text-brand-ink">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Lead Status Table */}
              <div className="mb-8 rounded-[24px] bg-white p-6 shadow-[var(--shadow-brand-sm)]">
                <h2 className="mb-4 text-[15px] font-bold text-brand-ink">Lead Status Breakdown</h2>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-brand-border">
                      <th className="pb-2 text-left font-semibold text-brand-ink-soft">Status</th>
                      <th className="pb-2 text-right font-semibold text-brand-ink-soft">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.leadStatuses ?? []).map((row) => (
                      <tr key={row.status} className="border-b border-brand-border/50">
                        <td className="py-2.5 capitalize text-brand-ink">{row.status.replace("_", " ")}</td>
                        <td className="py-2.5 text-right font-bold text-brand-ink">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
