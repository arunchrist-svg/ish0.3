"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Building2, CreditCard, Radar, Users, Rocket, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, text } from "@/design-system";
import { BrandIntelligenceSetup } from "@/components/brand-intelligence/brand-intelligence-setup";
import { SUBSCRIPTION_PLANS, formatPlanPriceMonthly, getPlanBySlug } from "@/lib/billing/plan-catalog";
import { PlanBenefitsList } from "@/components/billing/plan-benefits-list";

const STEPS = [
  { id: 1, label: "Organization", icon: Building2 },
  { id: 2, label: "Plan", icon: CreditCard },
  { id: 3, label: "Brand", icon: Radar },
  { id: 4, label: "Team", icon: Users },
  { id: 5, label: "Launch", icon: Rocket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [planSlug, setPlanSlug] = useState("starter");
  const [productCategory, setProductCategory] = useState("");
  const [competitorBrands, setCompetitorBrands] = useState<string[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [websiteStatus, setWebsiteStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const [onbRes, meRes] = await Promise.all([
        fetch("/api/onboarding"),
        fetch("/api/auth/me"),
      ]);
      if (onbRes.ok) {
        const data = await onbRes.json();
        setStep(data.step ?? 1);
        if (data.orgName) setOrgName(data.orgName);
        if (data.websiteUrl) setWebsiteUrl(data.websiteUrl);
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
    const category = productCategory.trim();
    if (!category) {
      setError("Product category is required");
      return;
    }
    if (competitorBrands.length === 0) {
      setError("Add at least one competitor brand");
      return;
    }
    const hasWebsite = Boolean(websiteUrl.trim());
    if (hasWebsite) {
      setAnalyzingWebsite(true);
      setWebsiteStatus("Reading your website to customise email writing and scouting…");
    }
    const data = await submitStep({
      step: 3,
      websiteUrl: websiteUrl.trim() || undefined,
      enrichmentConfig: {
        giftIntelProductCategory: category,
        giftIntelCompetitorBrands: competitorBrands,
      },
    });
    setAnalyzingWebsite(false);
    setWebsiteStatus("");
    if (!data) return;
    if (data.websiteWarning) {
      setWebsiteStatus(
        `Saved your website, but auto-customise had an issue: ${data.websiteWarning}. You can retry in Settings → Email.`,
      );
    } else if (data.brandAnalyzed) {
      setWebsiteStatus("Writer and Scout are now tuned from your website.");
    }
    setStep(data.nextStep);
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
          Complete these steps before accessing your sales hub. Add your website during Brand setup so Writer and Scout match how you sell; refine later in Settings.
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
          <div>
            <h2 className="text-lg font-semibold">Choose a plan</h2>
            <p className="mt-1 text-sm text-ish-ink-soft">
              All plans include one shared credit pool for your workspace. Credits cover scouting accounts, AI email writing, and live sends.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setPlanSlug(p.slug)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  planSlug === p.slug ? "border-ish-black ring-2 ring-ish-black/10" : "border-ish-border hover:border-ish-black/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <p className="mt-1 text-xs text-ish-ink-soft">{p.tagline}</p>
                  </div>
                  {p.highlight ? (
                    <span className="rounded-full bg-ish-black px-2 py-0.5 text-[10px] font-semibold text-white">
                      Popular
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-2xl font-bold">
                  {formatPlanPriceMonthly(p.priceCents).replace("/mo", "")}
                  <span className="text-sm font-normal">/mo</span>
                </div>
                <PlanBenefitsList plan={p} compact />
              </button>
            ))}
          </div>
          {getPlanBySlug(planSlug) ? (
            <p className="text-xs text-ish-ink-faint">
              Selected: {getPlanBySlug(planSlug)?.name}. Capacity numbers assume you use the full monthly credit pool on one activity type.
            </p>
          ) : null}
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
        <form onSubmit={handlePrefsSubmit} className="space-y-8 rounded-2xl border border-ish-border bg-white p-8">
          <div>
            <p className={cn(text.metaLabel, "mb-1 uppercase tracking-[0.14em] text-ish-ink-faint")}>
              Brand Intelligence
            </p>
            <h2 className="text-lg font-semibold">Your website, category, and competitors</h2>
            <p className="mt-1 text-sm text-ish-ink-soft">
              We read your website to customise email writing and scout targeting. Category and competitors power Corporate Gift Tracker sweeps.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ish-ink">Company website</label>
            <p className="mb-2 text-[11.5px] text-ish-ink-soft">
              Optional but recommended. Product summary, writing tone, and scout industries come from this page.
            </p>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="w-full rounded-xl border border-ish-border px-4 py-3"
              placeholder="https://yourcompany.com"
              autoComplete="url"
            />
          </div>

          <BrandIntelligenceSetup
            productCategory={productCategory}
            competitorBrands={competitorBrands}
            onProductCategoryChange={setProductCategory}
            onCompetitorBrandsChange={setCompetitorBrands}
          />

          {websiteStatus ? (
            <p className="rounded-xl bg-ish-app/80 px-4 py-3 text-[12px] text-ish-ink-soft">{websiteStatus}</p>
          ) : null}

          <Button
            type="submit"
            disabled={loading || analyzingWebsite || !productCategory.trim() || competitorBrands.length === 0}
            className="w-full"
          >
            {loading || analyzingWebsite ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {analyzingWebsite ? "Analysing website…" : "Saving…"}
              </>
            ) : websiteUrl.trim() ? (
              "Analyse website & continue"
            ) : (
              "Continue"
            )}
          </Button>
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
            Your workspace is ready. If you added a website, email drafts and scout filters already use it. Update competitors under{" "}
            <Link href="/settings?tab=enrichment" className="font-medium text-ish-ink underline">
              Settings → Enrichment
            </Link>
            {" "}or re-analyse your site under{" "}
            <Link href="/settings?tab=email" className="font-medium text-ish-ink underline">
              Settings → Email
            </Link>
            .
          </p>
          {websiteStatus ? (
            <p className="rounded-xl bg-ish-app/80 px-4 py-3 text-left text-[12px] text-ish-ink-soft">{websiteStatus}</p>
          ) : null}
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
