"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2, Zap } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-group";
import { Button } from "@/design-system";
import { toast } from "sonner";

type BillingSummary = {
  balance: number;
  plan: { slug: string; name: string; priceCents: number; includedCredits: number } | null;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
  usageLast30Days: { action: string; total: number }[];
};

const TOP_UPS = [
  { credits: 1000, price: 49, slug: "topup_1000" },
  { credits: 5000, price: 199, slug: "topup_5000" },
];

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
        <Loader2 className="size-6 animate-spin text-ish-ink-soft" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-ish-ink-soft">Unable to load billing.</p>;
  }

  return (
    <div className="space-y-6 pb-8">
      <SettingsGroup title="Current plan">
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-ish-ink">{data.plan?.name ?? "Trial"}</p>
              <p className="text-sm text-ish-ink-soft">
                {data.plan ? `$${(data.plan.priceCents / 100).toFixed(0)}/mo · ${data.plan.includedCredits.toLocaleString()} credits` : "14-day trial"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-ish-ink">{data.balance.toLocaleString()}</p>
              <p className="text-xs text-ish-ink-soft">credits remaining</p>
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
          {TOP_UPS.map((pack) => (
            <button
              key={pack.slug}
              type="button"
              onClick={() => checkout(pack.slug)}
              disabled={busy !== null}
              className="flex items-center justify-between rounded-xl border border-ish-border p-4 text-left hover:border-ish-black/30"
            >
              <span className="flex items-center gap-2 font-medium">
                <Zap className="size-4 text-amber-500" />
                {pack.credits.toLocaleString()} credits
              </span>
              <span className="font-semibold">${pack.price}</span>
            </button>
          ))}
        </div>
      </SettingsGroup>

      {data.usageLast30Days?.length > 0 && (
        <SettingsGroup title="Usage (last 30 days)">
          <ul className="divide-y divide-ish-border px-4">
            {data.usageLast30Days.map((row) => (
              <li key={row.action} className="flex justify-between py-3 text-sm">
                <span className="text-ish-ink-soft">{row.action}</span>
                <span className="font-medium">{row.total} credits</span>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      )}
    </div>
  );
}
