"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Building2, CreditCard, Settings, Users, Rocket, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, text } from "@/design-system";

type Plan = {
  slug: string;
  name: string;
  priceCents: number;
  includedCredits: number;
  seatLimit: number;
};

const STEPS = [
  { id: 1, label: "Organization", icon: Building2 },
  { id: 2, label: "Plan", icon: CreditCard },
  { id: 3, label: "Preferences", icon: Settings },
  { id: 4, label: "Team", icon: Users },
  { id: 5, label: "Launch", icon: Rocket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);

  const [orgName, setOrgName] = useState("");
  const [planSlug, setPlanSlug] = useState("starter");
  const [dataMode, setDataMode] = useState<"free" | "auto" | "paid">("free");

  useEffect(() => {
    void (async () => {
      const [onbRes, plansRes, meRes] = await Promise.all([
        fetch("/api/onboarding"),
        fetch("/api/billing/plans"),
        fetch("/api/auth/me"),
      ]);
      if (onbRes.ok) {
        const data = await onbRes.json();
        setStep(data.step ?? 1);
        if (data.orgName) setOrgName(data.orgName);
      }
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans ?? []);
      }
      if (meRes.ok) {
        const data = await meRes.json();
        if (data.tenant?.name && data.tenant.name !== "India Sweet House") {
          setOrgName(data.tenant.name);
        }
      }
    })();
  }, []);

  async function submitStep(body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return null;
    }
    return data;
  }

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await submitStep({ step: 1, orgName });
    if (data) setStep(data.nextStep);
  }

  async function handlePlanTrial() {
    const data = await submitStep({ step: 2, planSlug });
    if (data) setStep(data.nextStep);
  }

  async function handlePlanSubscribe() {
    setLoading(true);
    setError("");
    await submitStep({ step: 2, planSlug });
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planSlug }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Checkout unavailable. Continue with trial.");
      const trial = await submitStep({ step: 2, planSlug });
      if (trial) setStep(trial.nextStep);
    }
  }

  async function handlePrefsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await submitStep({ step: 3, enrichmentConfig: { dataMode } });
    if (data) setStep(data.nextStep);
  }

  async function handleTeamSkip() {
    const data = await submitStep({ step: 4, skip: true });
    if (data) setStep(data.nextStep);
  }

  async function handleComplete() {
    const data = await submitStep({ step: 5, complete: true });
    if (data?.redirect) router.push(data.redirect);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10">
        <h1 className={cn("mb-2", text.display)}>Set up your workspace</h1>
        <p className="text-sm text-ish-ink-soft">
          Complete these steps before accessing your sales hub. Email sending is configured later in Settings.
        </p>
      </div>

      <div className="mb-10 flex gap-2 overflow-x-auto">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex min-w-[100px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-center text-xs",
              step === s.id ? "bg-ish-black text-white" : step > s.id ? "bg-ish-black/10 text-ish-ink" : "bg-white text-ish-ink-faint",
            )}
          >
            <s.icon className="size-4" />
            {s.label}
          </div>
        ))}
      </div>

      {error ? (
        <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {step === 1 && (
        <form onSubmit={handleOrgSubmit} className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Your organization</h2>
          <div>
            <label className="mb-2 block text-sm font-medium">Company name</label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="w-full rounded-xl border border-ish-border px-4 py-3"
              placeholder="Acme Corp"
            />
          </div>
          <Button type="submit" disabled={loading || !orgName.trim()} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
          </Button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Choose a plan</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(plans.length ? plans : [
              { slug: "starter", name: "Starter", priceCents: 9900, includedCredits: 500, seatLimit: 2 },
              { slug: "growth", name: "Growth", priceCents: 29900, includedCredits: 2500, seatLimit: 5 },
              { slug: "scale", name: "Scale", priceCents: 79900, includedCredits: 10000, seatLimit: 15 },
            ]).map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setPlanSlug(p.slug)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  planSlug === p.slug ? "border-ish-black ring-2 ring-ish-black/10" : "border-ish-border hover:border-ish-black/30",
                )}
              >
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-2xl font-bold">${(p.priceCents / 100).toFixed(0)}<span className="text-sm font-normal">/mo</span></div>
                <div className="mt-2 text-xs text-ish-ink-soft">{p.includedCredits.toLocaleString()} credits · {p.seatLimit} seats</div>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={handlePlanTrial} disabled={loading} className="flex-1">
              Start 14-day trial (200 credits)
            </Button>
            <Button type="button" onClick={handlePlanSubscribe} disabled={loading} className="flex-1">
              Subscribe now
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={handlePrefsSubmit} className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Enrichment preferences</h2>
          <p className="text-sm text-ish-ink-soft">Choose how contact and company data is enriched during scouting.</p>
          <div className="flex gap-3">
            {(["free", "auto", "paid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDataMode(mode)}
                className={cn("rounded-xl border px-4 py-3 capitalize", dataMode === mode ? "border-ish-black bg-ish-black/5" : "border-ish-border")}
              >
                {mode}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={loading} className="w-full">Continue</Button>
        </form>
      )}

      {step === 4 && (
        <div className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Invite your team</h2>
          <p className="text-sm text-ish-ink-soft">
            Invite teammates from Settings → Team after launch. Each user only sees your organization&apos;s data.
          </p>
          <Button type="button" onClick={handleTeamSkip} disabled={loading} className="w-full">Skip for now</Button>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-6 rounded-2xl border border-ish-border bg-white p-8 text-center">
          <Rocket className="mx-auto size-12 text-ish-black" />
          <h2 className="text-lg font-semibold">You&apos;re ready to scout</h2>
          <p className="text-sm text-ish-ink-soft">
            Your workspace is ready. Configure outreach email anytime under{" "}
            <Link href="/settings?tab=email" className="font-medium text-ish-ink underline">
              Settings → Email
            </Link>
            .
          </p>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-ish-app/80 px-4 py-3 text-[12px] text-ish-ink-soft">
            <Mail className="size-4 shrink-0" />
            SMTP, Resend, send mode, and test sends live in Settings, not setup.
          </div>
          <Button type="button" onClick={handleComplete} disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Enter Sales Hub"}
          </Button>
        </div>
      )}
    </div>
  );
}
