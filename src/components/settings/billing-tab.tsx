"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-group";
import { Button } from "@/design-system";
import { toast } from "sonner";
import { TOP_UP_PACKS, formatPlanPrice, formatPlanPriceMonthly } from "@/lib/billing/plan-catalog";

type BillingSummary = {
  balance: number;
  plan: { slug: string; name: string; priceCents: number; includedCredits: number } | null;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
  usageLast30Days: { action: string; total: number }[];
};

export function BillingTab() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-ink-soft" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-brand-ink-soft">Unable to load billing.</p>;
  }

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title="Current plan">
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-brand-ink">{data.plan?.name ?? "Trial"}</p>
              <p className="text-sm text-brand-ink-soft">
                {data.plan
                  ? `${formatPlanPriceMonthly(data.plan.priceCents)} · ${data.plan.includedCredits.toLocaleString("en-IN")} credits`
                  : "14-day trial"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-brand-ink">{data.balance.toLocaleString("en-IN")}</p>
              <p className="text-xs text-brand-ink-soft">credits remaining</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => checkout("growth")} disabled={busy !== null}>
              {busy === "growth" ? <Loader2 className="size-4 animate-spin" /> : "Upgrade to Growth"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openPortal} disabled={busy !== null}>
              <ExternalLink className="mr-1 size-3.5" /> Manage subscription
            </Button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Top-up credits">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          {TOP_UP_PACKS.slice(0, 2).map((pack) => (
            <button
              key={pack.slug}
              type="button"
              onClick={() => checkout(pack.slug)}
              disabled={busy !== null}
              className="flex items-center justify-between rounded-xl border border-brand-border p-4 text-left hover:border-brand-black/30"
            >
              <span className="flex items-center gap-2 font-medium">
                <Zap className="size-4 text-amber-500" />
                {pack.credits.toLocaleString("en-IN")} credits
              </span>
              <span className="font-semibold">{formatPlanPrice(pack.priceCents)}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>

      {data.usageLast30Days?.length > 0 && (
        <SettingsGroup title="Usage (last 30 days)">
          <ul className="divide-y divide-brand-border px-4">
            {data.usageLast30Days.map((row) => (
              <li key={row.action} className="flex justify-between py-3 text-sm">
                <span className="text-brand-ink-soft">{row.action}</span>
                <span className="font-medium">{row.total} credits</span>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      )}
    </div>
  );
}
