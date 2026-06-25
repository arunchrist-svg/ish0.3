"use client";

import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSelectRow } from "@/components/settings/settings-select-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import { EMAIL_PROVIDER_OPTIONS, EMAIL_SEND_MODE_OPTIONS } from "@/lib/email/config";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

type Props = {
  config: EmailConfigResponse | null;
  onUpdate: <K extends keyof EmailConfigResponse>(key: K, value: EmailConfigResponse[K]) => void;
  smtpPassDraft: string;
  onSmtpPassChange: (value: string) => void;
  resendApiKeyDraft: string;
  onResendApiKeyChange: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
};

function SettingsTextRow({
  label,
  desc,
  value,
  onChange,
  placeholder,
  type = "text",
  showDivider,
}: {
  label: string;
  desc?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  showDivider?: boolean;
}) {
  return (
    <>
      {showDivider ? <SettingsGroupDivider /> : null}
      <SettingsRow className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-ish-ink">{label}</div>
          {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-ish-ink-soft">{desc}</p> : null}
        </div>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-xl border border-ish-border/60 bg-ish-canvas/50 px-3 py-2 text-[14px] text-ish-ink sm:max-w-[280px]",
            "focus:border-ish-stratus-blue/50 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/15",
          )}
        />
      </SettingsRow>
    </>
  );
}

function StatusBadge({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ish-green-soft px-2.5 py-1 text-[11px] font-semibold text-ish-green">
      <CheckCircle2 className="size-3" /> {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ish-pink-soft px-2.5 py-1 text-[11px] font-semibold text-ish-stratus-salmon">
      <XCircle className="size-3" /> {failLabel}
    </span>
  );
}

export function EmailTab({ config, onUpdate, smtpPassDraft, onSmtpPassChange, resendApiKeyDraft, onResendApiKeyChange, onVerify, verifying }: Props) {
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);

  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-[13px] text-ish-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading email settings…
      </div>
    );
  }

  const isSmtp = config.provider === "smtp";
  const isResend = config.provider === "resend";
  const resendReady = Boolean(config.resendApiKeySet || resendApiKeyDraft.trim());
  const providerReady = isSmtp ? config.smtpConfigured : resendReady;
  const canSelectLive = config.sendMode === "live" || providerReady;

  const smtpEmail = config.smtpUser || "";

  const senderFooter = isSmtp
    ? smtpEmail
      ? `From email must match your Gmail address (${smtpEmail}).`
      : "From email must match the Gmail address entered above."
    : "From address must be verified in your Resend dashboard.";

  const sendModeFooter = isSmtp
    ? "Start with Dry run, then Test with your inbox, then Live once SMTP credentials are verified."
    : "Start with Dry run, then Test with your inbox, then Live when domain is verified in Resend.";

  function handleSmtpUserChange(email: string) {
    onUpdate("smtpUser", email);
    if (email.includes("@")) {
      onUpdate("fromAddress", email);
      onUpdate("replyToAddress", email);
    }
  }

  return (
    <div className="pb-8">
      {config.validationWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-ish-stratus-salmon/30 bg-ish-pink-soft/40 px-4 py-3">
          <div className="flex items-start gap-2 text-[13px] text-ish-stratus-salmon">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <ul className="list-inside list-disc space-y-1">
              {config.validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <SettingsGroup title="Provider" footer="Choose how outbound email is delivered.">
        {EMAIL_PROVIDER_OPTIONS.map((option, i) => (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            badge={option.badge}
            selected={config.provider === option.value}
            onSelect={() => onUpdate("provider", option.value)}
            showDivider={i > 0}
          />
        ))}
      </SettingsGroup>

      {isSmtp && (
        <>
          <SettingsGroup
            title="Gmail SMTP credentials"
            footer="Verify connection saves your credentials to the workspace. Use a Google App Password — not your login password."
          >
            <SettingsRow className="justify-between">
              <div>
                <div className="text-[15px] font-medium text-ish-ink">Connection status</div>
                <p className="mt-0.5 text-[12px] text-ish-ink-soft">{config.smtpHint}</p>
              </div>
              <StatusBadge
                ok={config.smtpConfigured}
                okLabel="Verified"
                failLabel="Not verified"
              />
            </SettingsRow>
            <SettingsGroupDivider />
            <SettingsTextRow
              label="Gmail address"
              desc="The account you send from (e.g. srilaksha@gmail.com)"
              value={config.smtpUser}
              onChange={handleSmtpUserChange}
              placeholder="you@gmail.com"
              type="email"
              showDivider
            />
            <SettingsTextRow
              label="App Password"
              desc={
                config.smtpPassSet && !smtpPassDraft
                  ? "Password saved — enter a new one only to change it"
                  : "16-character Google App Password"
              }
              value={smtpPassDraft}
              onChange={onSmtpPassChange}
              placeholder={config.smtpPassSet ? "••••••••••••••••" : "xxxx xxxx xxxx xxxx"}
              type="password"
              showDivider
            />
            <SettingsGroupDivider />
            <SettingsRow>
              <button
                type="button"
                onClick={onVerify}
                disabled={verifying || !config.smtpUser}
                className={cn(
                  "rounded-xl bg-ish-stratus-blue px-4 py-2 text-[13px] font-semibold text-white",
                  "hover:bg-ish-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {verifying ? "Verifying…" : "Verify connection"}
              </button>
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="Google setup">
            <SettingsRow>
              <button
                type="button"
                onClick={() => setShowGoogleGuide((v) => !v)}
                className="flex w-full items-center justify-between text-left text-[14px] font-medium text-ish-ink"
              >
                How to get an App Password
                {showGoogleGuide ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </SettingsRow>
            {showGoogleGuide && (
              <div className="space-y-2 px-4 pb-4 text-[12px] leading-relaxed text-ish-ink-soft">
                <p>1. Enable 2-Step Verification on the Gmail account.</p>
                <p>2. Go to Google Account → Security → App passwords.</p>
                <p>3. Create a password for Mail, then paste it above and click Save.</p>
                <p>4. From email below will auto-match your Gmail address.</p>
              </div>
            )}
          </SettingsGroup>
        </>
      )}

      {isResend && (
        <SettingsGroup
          title="Resend"
          footer="Use your own Resend API key and a verified from-address for this workspace."
        >
          <SettingsTextRow
            label="API key"
            desc="From resend.com → API Keys. Stored per workspace, never shown again after save."
            value={resendApiKeyDraft}
            onChange={onResendApiKeyChange}
            placeholder={config.resendApiKeySet ? "•••••••• (saved — enter to replace)" : "re_..."}
            type="password"
          />
        </SettingsGroup>
      )}

      <SettingsGroup title="Send mode" footer={sendModeFooter}>
        {EMAIL_SEND_MODE_OPTIONS.map((mode, i) => {
          const disabled = mode.value === "live" && !canSelectLive && config.sendMode !== "live";
          return (
            <SettingsSelectRow
              key={mode.value}
              label={mode.label}
              desc={
                disabled
                  ? `${mode.desc} (requires verified ${isSmtp ? "SMTP" : "Resend"} credentials)`
                  : mode.desc
              }
              badge={mode.badge}
              selected={config.sendMode === mode.value}
              onSelect={() => !disabled && onUpdate("sendMode", mode.value)}
              showDivider={i > 0}
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup title="Sender" footer={senderFooter}>
        <SettingsTextRow
          label="From name"
          value={config.fromName}
          onChange={(v) => onUpdate("fromName", v)}
          placeholder="Srilaksha"
        />
        <SettingsTextRow
          label="From email"
          desc={isSmtp ? "Must match Gmail address above" : "Must match a verified domain in Resend"}
          value={config.fromAddress}
          onChange={(v) => onUpdate("fromAddress", v)}
          placeholder="you@gmail.com"
          showDivider
        />
        <SettingsTextRow
          label="Reply-to email"
          value={config.replyToAddress}
          onChange={(v) => onUpdate("replyToAddress", v)}
          placeholder="you@gmail.com"
          showDivider
        />
        {(config.sendMode === "test" || config.testRecipient) && (
          <SettingsTextRow
            label="Test recipient"
            desc="All emails go here in test mode"
            value={config.testRecipient}
            onChange={(v) => onUpdate("testRecipient", v)}
            placeholder="arun.jpeg@gmail.com"
            type="email"
            showDivider
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Cadence"
        footer="3-email sequence: initial email, then follow-up and final reminder if no reply."
      >
        <SettingsNumberRow
          label="Follow-up #1 (days after initial)"
          desc="Default: 3 days"
          value={config.cadenceDays[0]}
          min={1}
          max={14}
          onChange={(v) => onUpdate("cadenceDays", [v, config.cadenceDays[1]])}
        />
        <SettingsGroupDivider />
        <SettingsNumberRow
          label="Follow-up #2 (days after initial)"
          desc="Default: 7 days — final reminder"
          value={config.cadenceDays[1]}
          min={2}
          max={30}
          onChange={(v) => onUpdate("cadenceDays", [config.cadenceDays[0], v])}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Open tracking"
        footer="Public URL where your app is hosted. Used for the 1×1 tracking pixel in emails."
      >
        <SettingsTextRow
          label="App URL"
          desc="e.g. https://your-app.vercel.app or http://localhost:3002"
          value={config.appUrl}
          onChange={(v) => onUpdate("appUrl", v)}
          placeholder="http://localhost:3002"
        />
      </SettingsGroup>
    </div>
  );
}
