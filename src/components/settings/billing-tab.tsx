"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { Button } from "@/design-system";
import { toast } from "sonner";
import { TOP_UP_PACKS, formatPlanPrice, formatPlanPriceMonthly } from "@/lib/billing/plan-catalog";
import { labelForCreditAction, type CreditCostItem } from "@/lib/billing/credit-costs";
import { cn } from "@/lib/utils";

type BillingSummary = {
  balance: number;
  canManage: boolean;
  plan: { slug: string; name: string; priceCents: number; includedCredits: number } | null;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
  usageLast30Days: { action: string; total: number }[];
  costs: CreditCostItem[];
};

export function BillingTab() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCosts, setShowCosts] = useState(false);

  useEffect(() => {
    fetch("/api/billing/summary")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  async function checkout(planSlug: string) {
    setBusy(planSlug);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planSlug }),
    });
    const json = await res.json();
    setBusy(null);
    if (json.url) window.location.href = json.url;
    else toast.error(json.error ?? "Checkout failed");
  }

  async function openPortal() {
    setBusy("portal");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    setBusy(null);
    if (json.url) window.location.href = json.url;
    else toast.error(json.error ?? "Portal unavailable");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-brand-ink-soft" />
      </div>
    );
  }

  if (!data || typeof data.balance !== "number") {
    return <p className="text-sm text-brand-ink-soft">Unable to load credits.</p>;
  }

  const costs = data.costs ?? [];
  const canManage = data.canManage === true;

  return (
    <div className="pb-6">
      <SettingsGroup title="Balance" className="mb-4">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-brand-ink">{data.plan?.name ?? "Trial"}</p>
            <p className="text-[12px] text-brand-ink-soft">
              {data.plan
                ? `${formatPlanPriceMonthly(data.plan.priceCents)} · ${data.plan.includedCredits.toLocaleString("en-IN")} incl.`
                : "14-day trial"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tabular-nums text-brand-ink">{data.balance.toLocaleString("en-IN")}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">credits</p>
          </div>
        </div>
        {canManage ? (
          <>
            <SettingsGroupDivider />
            <div className="flex flex-wrap gap-2 px-4 py-3">
              <Button type="button" size="sm" onClick={() => checkout("growth")} disabled={busy !== null}>
                {busy === "growth" ? <Loader2 className="size-3.5 animate-spin" /> : "Upgrade"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={openPortal} disabled={busy !== null}>
                <ExternalLink className="mr-1 size-3.5" /> Manage
              </Button>
            </div>
          </>
        ) : null}
      </SettingsGroup>

      {canManage ? (
        <SettingsGroup title="Top up" className="mb-4">
          <div className="grid gap-2 px-4 py-3 sm:grid-cols-2">
            {TOP_UP_PACKS.slice(0, 2).map((pack) => (
              <button
                key={pack.slug}
                type="button"
                onClick={() => checkout(pack.slug)}
                disabled={busy !== null}
                className="flex items-center justify-between rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2.5 text-left hover:border-brand-stratus-blue/40"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-brand-ink">
                  <Zap className="size-3.5 text-brand-stratus-yellow" />
                  {pack.credits.toLocaleString("en-IN")}
                </span>
                <span className="text-[13px] font-semibold text-brand-ink">{formatPlanPrice(pack.priceCents)}</span>
              </button>
            ))}
          </div>
        </SettingsGroup>
      ) : null}

      {data.usageLast30Days?.length > 0 ? (
        <SettingsGroup title="Last 30 days" className="mb-4">
          {data.usageLast30Days.slice(0, 5).map((row, i) => (
            <div key={row.action}>
              {i > 0 ? <SettingsGroupDivider /> : null}
              <SettingsRow className="justify-between py-2.5">
                <span className="text-[13px] text-brand-ink-soft">{labelForCreditAction(row.action)}</span>
                <span className="text-[13px] font-semibold tabular-nums text-brand-ink">{row.total}</span>
              </SettingsRow>
            </div>
          ))}
        </SettingsGroup>
      ) : null}

      <button
        type="button"
        onClick={() => setShowCosts((open) => !open)}
        className="mb-3 flex w-full items-center justify-between rounded-2xl border border-brand-stratus-blue/20 bg-white/70 px-4 py-2.5 text-[12px] font-semibold text-brand-ink-soft shadow-[var(--shadow-brand-sm)] backdrop-blur-sm hover:text-brand-ink"
      >
        Task costs
        <span className={cn("text-[11px]", showCosts && "text-brand-ink")}>{showCosts ? "Hide" : "Show"}</span>
      </button>
      {showCosts ? (
        <SettingsGroup className="mb-4">
          {costs.map((item, index) => (
            <div key={item.action}>
              {index > 0 ? <SettingsGroupDivider /> : null}
              <SettingsRow className="justify-between gap-3 py-2.5">
                <span className="text-[13px] font-medium text-brand-ink">{item.label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-brand-ink-soft">
                  {item.credits}
                </span>
              </SettingsRow>
            </div>
          ))}
        </SettingsGroup>
      ) : null}
    </div>
  );
}
