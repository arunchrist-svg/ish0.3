"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Building2, CreditCard, Radar, Users, Rocket, Mail, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, text } from "@/design-system";
import { BrandIntelligenceSetup } from "@/components/brand-intelligence/brand-intelligence-setup";
import { SUBSCRIPTION_PLANS, formatPlanPriceMonthly, getPlanBySlug } from "@/lib/billing/plan-catalog";
import { PlanBenefitsList } from "@/components/billing/plan-benefits-list";
import {
  PLATFORM_INTENT_OPTIONS,
  brandIntelRecommendedForIntent,
  defaultIcpSummary,
  decisionMakerChoicesForIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import { isSweetsOnlyOperator, platformIntentOptionsForUser } from "@/lib/brand/vertical-catalog";
import { getIndustryByLabel } from "@/lib/brand-intel/industry-catalog";
import { AreaOfInterestWizard } from "@/components/settings/area-of-interest-wizard";
import { SettingsHero } from "@/components/settings/settings-hero";
import { DEFAULT_SCOUT_GEO, type ScoutGeoSelection } from "@/lib/geo/india";
import { OnboardingConnectEmail } from "@/components/onboarding/connect-email-step";
import { OnboardingPreferenceCoach } from "@/components/onboarding/onboarding-preference-coach";

function looksLikeWebsite(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function websiteKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed.toLowerCase().replace(/\/$/, "");
  }
}

const STEPS = [
  { id: 1, label: "Organization", icon: Building2 },
  { id: 2, label: "Plan", icon: CreditCard },
  { id: 3, label: "Brand", icon: Radar },
  { id: 3.4, label: "Preferences", icon: Sparkles },
  { id: 3.5, label: "Location", icon: MapPin },
  { id: 4, label: "Team", icon: Users },
  { id: 5, label: "Email", icon: Mail },
  { id: 6, label: "Launch", icon: Rocket },
];

const SETUP_CTA =
  "h-12 rounded-2xl text-[14px] font-bold text-white shadow-[var(--shadow-brand)] bg-brand-black hover:bg-brand-black/90 ring-1 ring-brand-stratus-blue/20";

const SETUP_FIELD =
  "ish-onboarding-field w-full rounded-xl border border-brand-border bg-brand-canvas px-4 py-3 text-[15px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue focus:bg-white focus:ring-2 focus:ring-brand-stratus-blue/20";

function viewRank(step: number, showCoach: boolean, showLocation: boolean): number {
  if (showCoach) return 3.4;
  if (showLocation) return 3.5;
  return step;
}

function onboardingStepState(stepId: number, currentRank: number, reachedRank: number) {
  if (stepId === currentRank) return "active" as const;
  if (reachedRank > stepId) return "done" as const;
  return "idle" as const;
}

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
  const [platformIntent, setPlatformIntent] = useState<PlatformIntent | null>(null);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [websiteStatus, setWebsiteStatus] = useState("");
  const [showLocation, setShowLocation] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [locationGeo, setLocationGeo] = useState<ScoutGeoSelection>(DEFAULT_SCOUT_GEO);
  const [reachedRank, setReachedRank] = useState(1);
  const [analyzedWebsiteUrl, setAnalyzedWebsiteUrl] = useState("");
  const [intentFromWebsite, setIntentFromWebsite] = useState(false);
  const [categoryFromWebsite, setCategoryFromWebsite] = useState(false);
  const [productWriteup, setProductWriteup] = useState("");
  const [emailKeywords, setEmailKeywords] = useState<string[]>([]);
  const [icpSummary, setIcpSummary] = useState("");
  const [icpTouched, setIcpTouched] = useState(false);
  const [dmChoiceIds, setDmChoiceIds] = useState<string[]>([]);
  const [brandIntelWanted, setBrandIntelWanted] = useState<boolean | null>(null);
  const intentOptions = platformIntentOptionsForUser(operatorEmail);
  const sweetsOnly = isSweetsOnlyOperator(operatorEmail);
  const websiteAnalysed =
    Boolean(analyzedWebsiteUrl) && websiteKey(websiteUrl) === websiteKey(analyzedWebsiteUrl);
  const currentRank = viewRank(step, showCoach, showLocation);

  useEffect(() => {
    setReachedRank((prev) => Math.max(prev, currentRank));
  }, [currentRank]);

  function goToStep(stepId: number) {
    if (stepId >= reachedRank) return;
    setError("");
    if (stepId === 3.5) {
      setStep(3);
      setShowCoach(false);
      setShowLocation(true);
      return;
    }
    if (stepId === 3.4) {
      setStep(3);
      setShowLocation(false);
      setShowCoach(true);
      return;
    }
    setShowLocation(false);
    setShowCoach(false);
    setStep(stepId);
  }

  useEffect(() => {
    void (async () => {
      const [onbRes, meRes] = await Promise.all([
        fetch("/api/onboarding"),
        fetch("/api/auth/me"),
      ]);
      if (onbRes.ok) {
        const data = await onbRes.json();
        const loaded = data.step ?? 1;
        setStep(loaded);
        if (loaded === 3 && data.brandReady && !data.preferenceReady) {
          setShowCoach(true);
          setShowLocation(false);
          setReachedRank(3.4);
        } else if (loaded === 3 && data.brandReady && data.preferenceReady && data.needsLocation) {
          setShowCoach(false);
          setShowLocation(true);
          setReachedRank(3.5);
        } else {
          setShowCoach(false);
          setShowLocation(false);
          setReachedRank(loaded);
        }
        if (data.scoutGeo) {
          setLocationGeo(data.scoutGeo as ScoutGeoSelection);
        }
        if (data.orgName) setOrgName(data.orgName);
        if (data.websiteUrl) setWebsiteUrl(data.websiteUrl);
        if (typeof data.productCategory === "string" && data.productCategory.trim()) {
          setProductCategory(data.productCategory);
        }
        if (Array.isArray(data.competitorBrands) && data.competitorBrands.length) {
          setCompetitorBrands(data.competitorBrands);
        }
        if (data.brandReady) {
          setBrandIntelWanted(
            data.brandIntelConfigured === true ||
              (Boolean(data.productCategory?.trim()) &&
                Array.isArray(data.competitorBrands) &&
                data.competitorBrands.length > 0),
          );
        }
        if (data.platformIntent) {
          setPlatformIntent(data.platformIntent as PlatformIntent);
        }
        if (typeof data.productWriteup === "string" && data.productWriteup.trim()) {
          setProductWriteup(data.productWriteup);
        }
        if (Array.isArray(data.emailKeywords)) {
          setEmailKeywords(data.emailKeywords.filter((k: unknown) => typeof k === "string" && k.trim()));
        }
        if (typeof data.icpSummary === "string" && data.icpSummary.trim()) {
          setIcpSummary(data.icpSummary);
          setIcpTouched(true);
        }
        if (data.websiteUrl && data.brandReady) {
          setAnalyzedWebsiteUrl(String(data.websiteUrl).replace(/\/$/, ""));
          setIntentFromWebsite(Boolean(data.platformIntent));
          setCategoryFromWebsite(Boolean(data.productCategory));
        }
      }
      if (meRes.ok) {
        const data = await meRes.json();
        if (data.tenant?.name) {
          setOrgName(data.tenant.name);
        }
        if (typeof data.user?.email === "string") {
          setOperatorEmail(data.user.email);
          if (isSweetsOnlyOperator(data.user.email)) {
            setPlatformIntent("corporate_gifting");
          }
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

  async function analyzeWebsiteAndFill(options?: { silent?: boolean }) {
    const url = websiteUrl.trim();
    if (!looksLikeWebsite(url)) {
      if (!options?.silent) setError("Enter a valid website URL (e.g. https://acme.com)");
      return false;
    }
    setError("");
    setAnalyzingWebsite(true);
    setWebsiteStatus("Reading your website to detect how you sell and your product category…");
    try {
      const res = await fetch("/api/settings/brand/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: url,
          persist: true,
          forceCustomSlug: true,
          platformIntent: sweetsOnly ? "corporate_gifting" : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWebsiteStatus(data.error ?? "Could not read that website. Pick category and Nebula use manually.");
        return false;
      }

      const inferredIntent = (data.platformIntent ?? data.insights?.platformIntent) as PlatformIntent | undefined;
      const allowed = inferredIntent && intentOptions.some((o) => o.value === inferredIntent);
      if (sweetsOnly) {
        setPlatformIntent("corporate_gifting");
        setIntentFromWebsite(true);
        if (!icpTouched) setIcpSummary(defaultIcpSummary("corporate_gifting"));
      } else if (allowed && inferredIntent) {
        setPlatformIntent(inferredIntent);
        setIntentFromWebsite(true);
        if (!icpTouched) setIcpSummary(defaultIcpSummary(inferredIntent));
      }

      const category =
        (typeof data.productCategory === "string" && data.productCategory.trim()) ||
        (typeof data.insights?.productCategory === "string" && data.insights.productCategory.trim()) ||
        "";
      if (category) {
        setProductCategory(category);
        setCategoryFromWebsite(true);
        if (competitorBrands.length === 0) {
          const suggested = getIndustryByLabel(category)?.suggestedCompetitors.slice(0, 2) ?? [];
          if (suggested.length) setCompetitorBrands(suggested);
        }
      }

      const writeup =
        (typeof data.productWriteup === "string" && data.productWriteup.trim()) ||
        (typeof data.insights?.productWriteup === "string" && data.insights.productWriteup.trim()) ||
        "";
      if (writeup) setProductWriteup(writeup);
      const keywords = Array.isArray(data.emailKeywords)
        ? data.emailKeywords
        : Array.isArray(data.insights?.emailKeywords)
          ? data.insights.emailKeywords
          : [];
      setEmailKeywords(
        keywords.filter((k: unknown): k is string => typeof k === "string" && Boolean(k.trim())),
      );

      const inferredIcp =
        (typeof data.insights?.icpSummary === "string" && data.insights.icpSummary.trim()) ||
        (typeof data.icpSummary === "string" && data.icpSummary.trim()) ||
        "";
      if (inferredIcp && !icpTouched) setIcpSummary(inferredIcp);

      setAnalyzedWebsiteUrl((data.websiteUrl as string | undefined) ?? url.replace(/\/$/, ""));
      const intentLabel = PLATFORM_INTENT_OPTIONS.find((o) => o.value === (sweetsOnly ? "corporate_gifting" : inferredIntent))?.label;
      setWebsiteStatus(
        [
          intentLabel ? `Nebula use: ${intentLabel}` : null,
          category ? `Product category: ${category}` : null,
          "You can change either before continuing.",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      return true;
    } catch {
      setWebsiteStatus("Could not read that website. Pick category and Nebula use manually.");
      return false;
    } finally {
      setAnalyzingWebsite(false);
    }
  }

  async function handlePrefsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const category = productCategory.trim();
    if (!platformIntent) {
      setError("Select what you will use Nebula for, or add a website to auto-detect.");
      return;
    }
    if (brandIntelWanted === null) {
      setError("Choose whether you need Brand Intelligence.");
      return;
    }
    if (brandIntelWanted) {
      if (!category) {
        setError("Product category is required for Brand Intelligence. Add a website to auto-select, or pick one below.");
        return;
      }
      if (competitorBrands.length === 0) {
        setError("Add at least one competitor brand, or skip Brand Intelligence.");
        return;
      }
    }
    const hasWebsite = Boolean(websiteUrl.trim());
    const alreadyAnalyzed = hasWebsite && websiteKey(analyzedWebsiteUrl) === websiteKey(websiteUrl);
    const skipWebsiteAnalyze = alreadyAnalyzed || !hasWebsite;

    if (hasWebsite && !skipWebsiteAnalyze) {
      setAnalyzingWebsite(true);
      setWebsiteStatus("Reading your website to customise email writing and scouting…");
    }
    const data = await submitStep({
      step: 3,
      websiteUrl: websiteUrl.trim() || undefined,
      skipWebsiteAnalyze,
      platformIntent,
      icpSummary: (icpSummary.trim() || (platformIntent ? defaultIcpSummary(platformIntent) : "")).trim() || undefined,
      buyerPersonas: platformIntent
        ? decisionMakerChoicesForIntent(platformIntent)
            .filter((c) => dmChoiceIds.includes(c.id))
            .map((c) => c.hint.split(",")[0]?.trim() || c.label)
        : undefined,
      enrichmentConfig: brandIntelWanted
        ? {
            giftIntelProductCategory: category,
            giftIntelCompetitorBrands: competitorBrands,
            brandIntelProductCategory: category,
            brandIntelCompetitorBrands: competitorBrands,
          }
        : {
            giftIntelProductCategory: "",
            giftIntelCompetitorBrands: [],
            brandIntelProductCategory: "",
            brandIntelCompetitorBrands: [],
          },
    });
    setAnalyzingWebsite(false);
    if (!data) return;
    if (data.websiteWarning) {
      setWebsiteStatus(
        `Saved your website, but auto-customise had an issue: ${data.websiteWarning}. You can retry in Settings → Email.`,
      );
    } else if (data.brandAnalyzed || alreadyAnalyzed) {
      setWebsiteStatus("Writer and Scout are now tuned from your website.");
    }
    if (data.needsPreferenceCoach) {
      setShowCoach(true);
      setShowLocation(false);
      setReachedRank(3.4);
      return;
    }
    if (data.needsLocation) {
      setShowCoach(false);
      setShowLocation(true);
      setReachedRank(3.5);
      return;
    }
    setStep(data.nextStep);
  }

  async function handleLocationComplete(scoutGeo: ScoutGeoSelection) {
    const data = await submitStep({ step: "location", scoutGeo });
    if (data) {
      setShowLocation(false);
      setShowCoach(false);
      setStep(data.nextStep);
    }
  }

  function handleCoachComplete(result: { needsLocation: boolean; nextStep?: number }) {
    setShowCoach(false);
    if (result.needsLocation) {
      setShowLocation(true);
      setReachedRank(3.5);
      return;
    }
    setStep(result.nextStep ?? 4);
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
    <div className="ish-onboarding-page settings-ambient mx-auto max-w-3xl px-6 py-10 sm:py-12 animate-brand-page-in">
      <SettingsHero icon={Sparkles} title="Set up your workspace" />

      <div
        className="ish-onboarding-stepper mb-10 grid w-full gap-1 overflow-hidden sm:gap-1.5"
        style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
      >
        {STEPS.map((s) => {
          const state = onboardingStepState(s.id, currentRank, reachedRank);
          const canGoBack = state === "done";
          return (
            <button
              key={s.id}
              type="button"
              data-state={state}
              disabled={!canGoBack}
              onClick={() => goToStep(s.id)}
              aria-current={state === "active" ? "step" : undefined}
              aria-label={canGoBack ? `Go back to ${s.label}` : s.label}
              className={cn(
                "ish-onboarding-step flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-center text-[10px] font-medium leading-tight sm:rounded-xl sm:px-1.5 sm:py-2 sm:text-[11px]",
                state === "active"
                  ? "bg-brand-black text-white"
                  : state === "done"
                    ? "cursor-pointer bg-brand-black/10 text-brand-ink hover:bg-brand-black/15"
                    : "cursor-default bg-white text-brand-ink-faint disabled:opacity-100",
              )}
            >
              <s.icon className="size-3.5 shrink-0 sm:size-4" />
              <span className="w-full break-words">{s.label}</span>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="ish-onboarding-error mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      ) : null}

      {step === 1 && (
        <form onSubmit={handleOrgSubmit} className="ish-onboarding-card space-y-6 rounded-2xl border border-brand-border bg-white p-8">
          <h2 className="text-lg font-semibold text-brand-ink">Your organization</h2>
          <div>
            <label className="mb-2 block text-sm font-medium text-brand-ink">Company name</label>
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className={SETUP_FIELD}
              placeholder="Acme Corp"
            />
          </div>
          <Button type="submit" disabled={loading || !orgName.trim()} className={cn("w-full", SETUP_CTA)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
          </Button>
        </form>
      )}

      {step === 2 && (
        <div className="ish-onboarding-card space-y-6 rounded-2xl border border-brand-border bg-white p-8">
          <div>
            <h2 className="text-lg font-semibold text-brand-ink">Choose a plan</h2>
            <p className="mt-1 text-sm text-brand-ink-soft">
              All plans include one shared credit pool for your workspace. Credits cover scouting accounts, AI email writing, and live sends.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((p) => (
              <button
                key={p.slug}
                type="button"
                data-selected={planSlug === p.slug}
                onClick={() => setPlanSlug(p.slug)}
                className={cn(
                  "ish-onboarding-choice rounded-xl border p-4 text-left transition",
                  planSlug === p.slug
                    ? "border-brand-stratus-blue bg-brand-green-soft/50 ring-2 ring-brand-stratus-blue/20"
                    : "border-brand-border hover:border-brand-stratus-blue/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-brand-ink">{p.name}</div>
                    <p className="mt-1 text-xs text-brand-ink-soft">{p.tagline}</p>
                  </div>
                  {p.highlight ? (
                    <span className="rounded-full bg-brand-black px-2 py-0.5 text-[10px] font-semibold text-white">
                      Popular
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-2xl font-bold text-brand-ink">
                  {formatPlanPriceMonthly(p.priceCents).replace("/mo", "")}
                  <span className="text-sm font-normal">/mo</span>
                </div>
                <PlanBenefitsList plan={p} compact />
              </button>
            ))}
          </div>
          {getPlanBySlug(planSlug) ? (
            <p className="text-xs text-brand-ink-faint">
              Selected: {getPlanBySlug(planSlug)?.name}. Capacity numbers assume you use the full monthly credit pool on one activity type.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handlePlanTrial}
              disabled={loading}
              className={cn("ish-onboarding-cta-outline h-12 flex-1 rounded-2xl text-[14px] font-semibold")}
            >
              Start 14-day trial (200 credits)
            </Button>
            <Button type="button" onClick={handlePlanSubscribe} disabled={loading} className={cn("flex-1", SETUP_CTA)}>
              Subscribe now
            </Button>
          </div>
        </div>
      )}

      {step === 3 && showCoach && !showLocation && (
        <OnboardingPreferenceCoach
          onComplete={handleCoachComplete}
          onError={(message) => setError(message)}
        />
      )}

      {step === 3 && showLocation && (
        <div className="ish-onboarding-card space-y-4 rounded-2xl border border-brand-border bg-white p-6">
          {websiteStatus ? (
            <p className="ish-onboarding-note rounded-xl bg-brand-app/80 px-4 py-3 text-[12px] text-brand-ink-soft">{websiteStatus}</p>
          ) : null}
          <AreaOfInterestWizard value={locationGeo} onComplete={handleLocationComplete} />
        </div>
      )}

      {step === 3 && !showLocation && !showCoach && (
        <form onSubmit={handlePrefsSubmit} className="ish-onboarding-card space-y-8 rounded-2xl border border-brand-border bg-white p-8">
          <div>
            <p className={cn(text.metaLabel, "mb-1 uppercase tracking-[0.14em] text-brand-stratus-blue")}>
              Brand
            </p>
            <h2 className="text-lg font-semibold text-brand-ink">Your company website</h2>
            <p className="mt-1 text-sm text-brand-ink-soft">
              Add your website. We will customise setup after we read it.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-brand-ink">Company website</label>
            <p className="mb-2 text-[11.5px] text-brand-ink-soft">
              Required. We use this page to tune email writing and scouting.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => {
                  setWebsiteUrl(e.target.value);
                  setIntentFromWebsite(false);
                  setCategoryFromWebsite(false);
                  if (websiteKey(e.target.value) !== websiteKey(analyzedWebsiteUrl)) {
                    setAnalyzedWebsiteUrl("");
                  }
                }}
                onBlur={() => {
                  if (looksLikeWebsite(websiteUrl) && !analyzingWebsite) {
                    const normalized = websiteUrl.trim().replace(/\/$/, "");
                    if (websiteKey(normalized) !== websiteKey(analyzedWebsiteUrl)) {
                      void analyzeWebsiteAndFill({ silent: true });
                    }
                  }
                }}
                className={SETUP_FIELD}
                placeholder="https://yourcompany.com"
                autoComplete="url"
              />
              <Button
                type="button"
                variant="outline"
                disabled={analyzingWebsite || !looksLikeWebsite(websiteUrl)}
                onClick={() => void analyzeWebsiteAndFill()}
                className="ish-onboarding-cta-outline h-12 shrink-0 rounded-2xl px-4 text-[13px] font-semibold"
              >
                {analyzingWebsite ? <Loader2 className="size-4 animate-spin" /> : "Analyse website"}
              </Button>
            </div>
          </div>

          {!websiteAnalysed && websiteStatus ? (
            <p className="ish-onboarding-note rounded-xl bg-brand-app/80 px-4 py-3 text-[12px] text-brand-ink-soft">{websiteStatus}</p>
          ) : null}

          {websiteAnalysed ? (
            <>
              <div>
                <label className="mb-2 block text-[13px] font-semibold text-brand-ink">
                  What will you use Nebula for?
                </label>
                <p className="mb-2 text-[11.5px] text-brand-ink-soft">
                  {intentFromWebsite && platformIntent
                    ? "Auto-selected from your website. Change it if this is wrong."
                    : "Change this if the auto-selection is wrong."}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {intentOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      data-selected={platformIntent === option.value}
                      onClick={() => {
                        setPlatformIntent(option.value);
                        setIntentFromWebsite(false);
                        if (!icpTouched) setIcpSummary(defaultIcpSummary(option.value));
                        setDmChoiceIds([]);
                      }}
                      className={cn(
                        "ish-onboarding-choice rounded-xl border p-3 text-left transition",
                        platformIntent === option.value
                          ? "border-brand-stratus-blue bg-brand-green-soft/50 ring-2 ring-brand-stratus-blue/20"
                          : "border-brand-border hover:border-brand-stratus-blue/40",
                      )}
                    >
                      <div className="text-[13px] font-semibold text-brand-ink">{option.label}</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-brand-ink-soft">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {platformIntent ? (
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-brand-ink">
                    Who do you sell to?
                  </label>
                  <p className="mb-2 text-[11.5px] leading-relaxed text-brand-ink-soft">
                    Scout uses this to pick buyer companies, not lookalike sellers. Writer uses it so emails match that buyer.
                    {platformIntent === "corporate_gifting"
                      ? " For sweets, that means employers who gift to staff, not other mithai shops."
                      : platformIntent === "b2b_saas"
                        ? " For software, that means companies that would buy your product."
                        : ""}
                  </p>
                  <textarea
                    value={icpSummary || defaultIcpSummary(platformIntent)}
                    onChange={(e) => {
                      setIcpTouched(true);
                      setIcpSummary(e.target.value);
                    }}
                    rows={3}
                    className={SETUP_FIELD}
                    placeholder={defaultIcpSummary(platformIntent)}
                  />
                  <div className="mt-4">
                    <p className="mb-1.5 text-[13px] font-semibold text-brand-ink">Who is the best decision maker?</p>
                    <p className="mb-2 text-[11.5px] leading-relaxed text-brand-ink-soft">
                      Used to rank leads and personalise emails. Scout People filters stay empty until you pick them on Scout.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {decisionMakerChoicesForIntent(platformIntent).map((choice) => {
                        const on = dmChoiceIds.includes(choice.id);
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            data-selected={on}
                            onClick={() =>
                              setDmChoiceIds((prev) =>
                                prev.includes(choice.id)
                                  ? prev.filter((id) => id !== choice.id)
                                  : [...prev, choice.id],
                              )
                            }
                            className={cn(
                              "rounded-full px-3.5 py-1.5 text-left text-[12px] font-semibold transition",
                              on
                                ? "bg-brand-ink text-white"
                                : "bg-brand-app text-brand-ink-soft ring-1 ring-brand-border hover:text-brand-ink",
                            )}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {productWriteup || emailKeywords.length ? (
                <div className="space-y-3 rounded-xl border border-brand-border bg-brand-app/60 px-4 py-3">
                  <p className="text-[12px] font-semibold text-brand-ink">Writer will use this from your website</p>
                  {productWriteup ? (
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-brand-ink-soft">Product writeup</p>
                      <p className="text-[13px] leading-relaxed text-brand-ink">{productWriteup}</p>
                    </div>
                  ) : null}
                  {emailKeywords.length ? (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-brand-ink-soft">Email focus keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {emailKeywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-brand-ink ring-1 ring-brand-border"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-brand-ink-faint">Edit later in Settings → Email if needed.</p>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-brand-ink">
                  Do you need Brand Intelligence?
                </label>
                <p className="mb-2 text-[11.5px] leading-relaxed text-brand-ink-soft">
                  It tracks which product a company currently buys from your competitors (for example,
                  who already orders a rival sweet brand or appliance). Works best for physical,
                  non-software products. Most SaaS teams skip this.
                </p>
                {platformIntent ? (
                  <p className="mb-2 text-[11.5px] font-medium text-brand-ink-soft">
                    {brandIntelRecommendedForIntent(platformIntent)
                      ? "Recommended for your product type."
                      : "Usually skip this for software or digital services."}
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    data-selected={brandIntelWanted === true}
                    onClick={() => setBrandIntelWanted(true)}
                    className={cn(
                      "ish-onboarding-choice rounded-xl border p-3 text-left transition",
                      brandIntelWanted === true
                        ? "border-brand-stratus-blue bg-brand-green-soft/50 ring-2 ring-brand-stratus-blue/20"
                        : "border-brand-border hover:border-brand-stratus-blue/40",
                    )}
                  >
                    <div className="text-[13px] font-semibold text-brand-ink">Yes, set it up</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-brand-ink-soft">
                      Pick a product category and competitor brands to sweep.
                    </p>
                  </button>
                  <button
                    type="button"
                    data-selected={brandIntelWanted === false}
                    onClick={() => setBrandIntelWanted(false)}
                    className={cn(
                      "ish-onboarding-choice rounded-xl border p-3 text-left transition",
                      brandIntelWanted === false
                        ? "border-brand-stratus-blue bg-brand-green-soft/50 ring-2 ring-brand-stratus-blue/20"
                        : "border-brand-border hover:border-brand-stratus-blue/40",
                    )}
                  >
                    <div className="text-[13px] font-semibold text-brand-ink">No, skip for now</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-brand-ink-soft">
                      You can turn this on later in Settings → Enrichment.
                    </p>
                  </button>
                </div>
              </div>

              {brandIntelWanted ? (
                <BrandIntelligenceSetup
                  productCategory={productCategory}
                  competitorBrands={competitorBrands}
                  onProductCategoryChange={(value) => {
                    setProductCategory(value);
                    setCategoryFromWebsite(false);
                  }}
                  onCompetitorBrandsChange={setCompetitorBrands}
                  categoryDesc={
                    categoryFromWebsite
                      ? "Auto-selected from your website. Change it if this is wrong."
                      : "Product type we look for when a company already buys from a competitor."
                  }
                  competitorsDesc="We look for public signals that a company currently uses these brands."
                />
              ) : null}

              <Button
                type="submit"
                disabled={
                  loading ||
                  analyzingWebsite ||
                  !platformIntent ||
                  brandIntelWanted === null ||
                  (brandIntelWanted === true &&
                    (!productCategory.trim() || competitorBrands.length === 0))
                }
                className={cn("w-full", SETUP_CTA)}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
              </Button>
            </>
          ) : null}
        </form>
      )}

      {step === 4 && (
        <div className="ish-onboarding-card space-y-6 rounded-2xl border border-brand-border bg-white p-8">
          <h2 className="text-lg font-semibold text-brand-ink">Invite your team</h2>
          <p className="text-sm text-brand-ink-soft">
            Invite teammates from Settings → Team after launch. Each user only sees your organization&apos;s data.
          </p>
          <Button type="button" onClick={handleTeamSkip} disabled={loading} className={cn("w-full", SETUP_CTA)}>
            Skip for now
          </Button>
        </div>
      )}

      {step === 5 && (
        <div className="ish-onboarding-card space-y-6 rounded-2xl border border-brand-border bg-white p-8 text-center">
          <Rocket className="mx-auto size-12 text-brand-stratus-blue" />
          <h2 className="text-lg font-semibold text-brand-ink">You&apos;re ready to scout</h2>
          <p className="text-sm text-brand-ink-soft">
            Your workspace is ready. If you added a website, email drafts and scout filters already use it.
          </p>
          {websiteStatus ? (
            <p className="ish-onboarding-note rounded-xl bg-brand-app/80 px-4 py-3 text-left text-[12px] text-brand-ink-soft">{websiteStatus}</p>
          ) : null}
          <div className="ish-onboarding-note space-y-2 rounded-xl border border-brand-border bg-brand-app/80 px-4 py-3 text-left text-[12px] text-brand-ink-soft">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 size-4 shrink-0 text-brand-stratus-blue" />
              <div>
                <p className="font-medium text-brand-ink">Next: connect your outbound email</p>
                <p className="mt-0.5">
                  After you enter the hub, open{" "}
                  <Link href="/settings?tab=email" className="font-medium text-brand-stratus-blue underline">
                    Settings → Email
                  </Link>
                  {" "}and add your own Gmail or Resend credentials. Nothing is pre-filled from another company.
                </p>
              </div>
            </div>
            <p>
              Optional: Brand Intelligence (competitor product tracking, best for non-software) lives under{" "}
              <Link href="/settings?tab=enrichment" className="font-medium text-brand-stratus-blue underline">
                Settings → Enrichment
              </Link>
              .
            </p>
          </div>
          <Button type="button" onClick={handleComplete} disabled={loading} className={cn("w-full", SETUP_CTA)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Enter Nebula"}
          </Button>
        </div>
      )}
    </div>
  );
}
