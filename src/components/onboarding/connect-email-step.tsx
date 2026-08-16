"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import type { EmailProvider, EmailSendMode } from "@/lib/email/config";

const SETUP_CTA =
  "h-12 rounded-2xl text-[14px] font-bold text-white shadow-[var(--shadow-brand)] bg-brand-black hover:bg-brand-black/90 ring-1 ring-brand-stratus-blue/20";

const SETUP_FIELD =
  "w-full rounded-xl border border-brand-border bg-brand-canvas px-4 py-3 text-[15px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue focus:bg-white focus:ring-2 focus:ring-brand-stratus-blue/20";

type Props = {
  onContinue: () => void;
  onSkip: () => void;
  loading?: boolean;
};

export function OnboardingConnectEmail({ onContinue, onSkip, loading }: Props) {
  const [config, setConfig] = useState<EmailConfigResponse | null>(null);
  const [provider, setProvider] = useState<EmailProvider>("smtp");
  const [sendMode, setSendMode] = useState<EmailSendMode>("dry_run");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/email")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EmailConfigResponse | null) => {
        if (!data) return;
        setConfig(data);
        setProvider(data.provider);
        setSendMode(data.sendMode === "live" ? "test" : data.sendMode);
        setSmtpUser(data.smtpUser ?? "");
        setFromAddress(data.fromAddress ?? "");
        setReady(data.provider === "smtp" ? data.smtpConfigured : data.resendConfigured);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        provider,
        sendMode: sendMode === "live" ? "test" : sendMode,
        fromAddress,
        smtpUser,
      };
      if (smtpPass.trim()) body.smtpPass = smtpPass.trim();
      if (resendKey.trim()) body.resendApiKey = resendKey.trim();
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          Array.isArray(data.errors) ? data.errors.join("; ") : (data.error ?? "Could not save email settings"),
        );
        return;
      }
      if (provider === "smtp") {
        const verify = await fetch("/api/settings/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const verified = await verify.json().catch(() => ({}));
        if (!verify.ok || !verified.smtpConfigured) {
          setError(verified.smtpHint ?? "Could not verify SMTP. You can skip and connect later.");
          return;
        }
      }
      setReady(true);
      onContinue();
    } catch {
      setError("Could not save email settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ish-onboarding-card space-y-5 rounded-2xl border border-brand-border bg-white p-8">
      <div>
        <h2 className="text-lg font-semibold text-brand-ink">Connect sending</h2>
        <p className="mt-1 text-sm text-brand-ink-soft">
          Add Gmail/Zoho SMTP or a Resend key. Start in dry run or test. Live stays in Settings after you verify DNS.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["smtp", "resend"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setProvider(value)}
            className={cn(
              "rounded-xl border px-3 py-2 text-[13px] font-semibold",
              provider === value
                ? "border-brand-stratus-blue bg-brand-green-soft/50"
                : "border-brand-border",
            )}
          >
            {value === "smtp" ? "Gmail / SMTP" : "Resend"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["dry_run", "test"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSendMode(value)}
            className={cn(
              "rounded-xl border px-3 py-2 text-[13px] font-semibold",
              sendMode === value
                ? "border-brand-stratus-blue bg-brand-green-soft/50"
                : "border-brand-border",
            )}
          >
            {value === "dry_run" ? "Dry run" : "Test inbox"}
          </button>
        ))}
      </div>

      <input
        className={SETUP_FIELD}
        placeholder="From address"
        value={fromAddress}
        onChange={(e) => setFromAddress(e.target.value)}
      />

      {provider === "smtp" ? (
        <>
          <input
            className={SETUP_FIELD}
            placeholder="SMTP user (your inbox)"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
          />
          <input
            className={SETUP_FIELD}
            type="password"
            placeholder={config?.smtpPassSet ? "App password (unchanged if blank)" : "App password"}
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
          />
        </>
      ) : (
        <input
          className={SETUP_FIELD}
          type="password"
          placeholder={config?.resendApiKeySet ? "Resend API key (unchanged if blank)" : "Resend API key"}
          value={resendKey}
          onChange={(e) => setResendKey(e.target.value)}
        />
      )}

      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
      {ready ? (
        <p className="text-[12px] text-emerald-700">Sending is connected. You can scout next.</p>
      ) : null}

      <Button type="button" onClick={() => void handleSave()} disabled={saving || loading} className={cn("w-full", SETUP_CTA)}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save and continue"}
      </Button>
      <button
        type="button"
        onClick={onSkip}
        className="w-full text-center text-[13px] font-medium text-brand-ink-soft underline"
      >
        Skip for now
      </button>
    </div>
  );
}
