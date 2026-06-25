"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Building2, CreditCard, Settings, Users, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, text } from "@/design-system";
import { EMAIL_PROVIDER_OPTIONS, EMAIL_SEND_MODE_OPTIONS } from "@/lib/email/config";

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
  { id: 3, label: "Email", icon: Mail },
  { id: 4, label: "Preferences", icon: Settings },
  { id: 5, label: "Team", icon: Users },
  { id: 6, label: "Launch", icon: Rocket },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [userEmail, setUserEmail] = useState("");

  const [orgName, setOrgName] = useState("");
  const [planSlug, setPlanSlug] = useState("starter");
  const [emailProvider, setEmailProvider] = useState<"smtp" | "resend">("smtp");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [sendMode, setSendMode] = useState<"dry_run" | "test" | "live">("test");
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
        setUserEmail(data.user?.email ?? "");
        setTestRecipient(data.user?.email ?? "");
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
      setError(data.error ?? "Checkout unavailable — continue with trial");
      const trial = await submitStep({ step: 2, planSlug });
      if (trial) setStep(trial.nextStep);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await submitStep({
      step: 3,
      sendTest: true,
      emailConfig: {
        provider: emailProvider,
        sendMode,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpSecure: false,
        smtpUser,
        smtpPass,
        fromAddress,
        fromName: fromName || orgName,
        testRecipient: testRecipient || userEmail,
        replyToAddress: fromAddress,
        replyToName: fromName || orgName,
      },
    });
    if (data) setStep(data.nextStep);
  }

  async function handlePrefsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await submitStep({ step: 4, enrichmentConfig: { dataMode } });
    if (data) setStep(data.nextStep);
  }

  async function handleTeamSkip() {
    const data = await submitStep({ step: 5, skip: true });
    if (data) setStep(data.nextStep);
  }

  async function handleComplete() {
    const data = await submitStep({ step: 6, complete: true });
    if (data?.redirect) router.push(data.redirect);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10">
        <h1 className={cn("mb-2", text.display)}>Set up your workspace</h1>
        <p className="text-sm text-ish-ink-soft">
          Complete these steps before accessing your sales hub. Your data stays private to your organization.
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
        <form onSubmit={handleEmailSubmit} className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Email setup</h2>
          <p className="text-sm text-ish-ink-soft">Configure how outreach emails are sent from your workspace. A test email is required to continue.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {EMAIL_PROVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEmailProvider(opt.value)}
                className={cn(
                  "rounded-xl border p-3 text-left text-sm",
                  emailProvider === opt.value ? "border-ish-black" : "border-ish-border",
                )}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs text-ish-ink-soft">{opt.desc}</div>
              </button>
            ))}
          </div>

          {emailProvider === "smtp" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host" className="rounded-xl border px-4 py-3" />
              <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="Port" className="rounded-xl border px-4 py-3" />
              <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="SMTP user" className="rounded-xl border px-4 py-3" required />
              <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="SMTP password / app password" className="rounded-xl border px-4 py-3" required />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <input value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="From email" className="rounded-xl border px-4 py-3" required />
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="From name" className="rounded-xl border px-4 py-3" />
            <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="Test recipient" className="rounded-xl border px-4 py-3 sm:col-span-2" required />
          </div>

          <div className="flex flex-wrap gap-2">
            {EMAIL_SEND_MODE_OPTIONS.filter((m) => m.value !== "live").map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setSendMode(m.value)}
                className={cn("rounded-lg border px-3 py-1.5 text-xs", sendMode === m.value ? "border-ish-black bg-ish-black text-white" : "border-ish-border")}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Save & send test email"}
          </Button>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handlePrefsSubmit} className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Enrichment preferences</h2>
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

      {step === 5 && (
        <div className="space-y-6 rounded-2xl border border-ish-border bg-white p-8">
          <h2 className="text-lg font-semibold">Invite your team</h2>
          <p className="text-sm text-ish-ink-soft">You can invite teammates from Settings → Team after launch. Each user only sees your organization&apos;s data.</p>
          <Button type="button" onClick={handleTeamSkip} disabled={loading} className="w-full">Skip for now</Button>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-6 rounded-2xl border border-ish-border bg-white p-8 text-center">
          <Rocket className="mx-auto size-12 text-ish-black" />
          <h2 className="text-lg font-semibold">You&apos;re ready to scout</h2>
          <p className="text-sm text-ish-ink-soft">Your workspace is configured with isolated data and email setup complete.</p>
          <Button type="button" onClick={handleComplete} disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Enter Sales Hub"}
          </Button>
        </div>
      )}
    </div>
  );
}
