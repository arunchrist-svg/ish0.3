"use client";

import { SenderHealthSettings } from "@/components/settings/sender-health-settings";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSelectRow } from "@/components/settings/settings-select-row";
import { SettingsNumberRow } from "@/components/settings/settings-number-row";
import {
  EMAIL_PROVIDER_OPTIONS,
  EMAIL_SEND_MODE_OPTIONS,
  EMAIL_STYLE_OPTIONS,
  FOLLOW_UP_POLICY_OPTIONS,
  type FollowUpPolicy,
  type BrandConfig,
  type BrandSlug,
  type CampaignMode,
} from "@/lib/email/config";
import { BRAND_PRESET_OPTIONS, campaignModeOptionsForBrand, brandConfigFromPresetSelection, brandConfigFromPlatformIntent } from "@/lib/email/brand-presets";
import {
  PLATFORM_INTENT_OPTIONS,
  defaultCampaignModeForIntent,
  resolvePlatformIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

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
          <div className="text-[15px] font-medium text-brand-ink">{label}</div>
          {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink-soft">{desc}</p> : null}
        </div>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-xl border border-brand-border/60 bg-brand-canvas/50 px-3 py-2 text-[14px] text-brand-ink sm:max-w-[280px]",
            "focus:border-brand-stratus-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-stratus-blue/15",
          )}
        />
      </SettingsRow>
    </>
  );
}

function StatusBadge({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-soft px-2.5 py-1 text-[11px] font-semibold text-brand-green">
      <CheckCircle2 className="size-3" /> {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pink-soft px-2.5 py-1 text-[11px] font-semibold text-brand-stratus-salmon">
      <XCircle className="size-3" /> {failLabel}
    </span>
  );
}

export function EmailTab({ config, onUpdate, smtpPassDraft, onSmtpPassChange, resendApiKeyDraft, onResendApiKeyChange, onVerify, verifying }: Props) {
  const [showGoogleGuide, setShowGoogleGuide] = useState(false);
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState("");

  const campaignOptions = useMemo(
    () => campaignModeOptionsForBrand(config?.brandConfig),
    [config?.brandConfig],
  );

  const activeIntent = resolvePlatformIntent(
    config?.brandConfig?.platformIntent,
    config?.brandConfig?.verticalPackId ?? config?.brandConfig?.brandSlug,
  );

  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-[13px] text-brand-ink-faint">
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

  async function analyzeWebsite() {
    if (!config) return;
    const url = (config.brandConfig?.websiteUrl ?? "").trim();
    if (!url) {
      setAnalyzeMessage("Enter a website URL first.");
      return;
    }
    setAnalyzingWebsite(true);
    setAnalyzeMessage("Reading your website…");
    try {
      const intent = resolvePlatformIntent(
        config.brandConfig?.platformIntent,
        config.brandConfig?.verticalPackId,
      );
      const res = await fetch("/api/settings/brand/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: url,
          persist: true,
          platformIntent: intent === "general_b2b" ? undefined : intent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnalyzeMessage(data.error ?? "Website analysis failed");
        return;
      }
      if (data.brandConfig) {
        onUpdate("brandConfig", data.brandConfig as BrandConfig);
      }
      if (data.campaignMode) {
        onUpdate("campaignMode", data.campaignMode as CampaignMode);
      }
      const industries = data.insights?.scoutIndustries?.join(", ");
      const intentLabel = PLATFORM_INTENT_OPTIONS.find((o) => o.value === data.platformIntent)?.label;
      setAnalyzeMessage(
        [
          intentLabel ? `Intent: ${intentLabel}.` : null,
          industries
            ? `Updated product summary, writing style, and Scout targets (${industries}).`
            : "Updated product summary and writing style from your website.",
          "Save if you change anything else.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch {
      setAnalyzeMessage("Website analysis failed. Try again.");
    } finally {
      setAnalyzingWebsite(false);
    }
  }

  return (
    <div className="pb-8">
      {config.validationWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-brand-stratus-salmon/30 bg-brand-pink-soft/40 px-4 py-3">
          <div className="flex items-start gap-2 text-[13px] text-brand-stratus-salmon">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <ul className="list-inside list-disc space-y-1">
              {config.validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <SettingsGroup
        title="Outreach sending"
        footer="Pause stops Email 1 sends and automated follow-ups. Scheduled emails stay queued until you resume."
      >
        <SettingsSelectRow
          label="Sending active"
          desc="Email 1 and sequence follow-ups can send on schedule."
          selected={!config.outreachPaused}
          onSelect={() => onUpdate("outreachPaused", false)}
        />
        <SettingsSelectRow
          label="Paused"
          desc="No outbound emails until you resume. Drafts and approvals are kept."
          selected={Boolean(config.outreachPaused)}
          onSelect={() => onUpdate("outreachPaused", true)}
          showDivider
        />
      </SettingsGroup>

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
                <div className="text-[15px] font-medium text-brand-ink">Connection status</div>
                <p className="mt-0.5 text-[12px] text-brand-ink-soft">{config.smtpHint}</p>
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
              desc="Your outbound Gmail or Google Workspace address"
              value={config.smtpUser}
              onChange={handleSmtpUserChange}
              placeholder="you@company.com"
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
                  "rounded-xl bg-brand-stratus-blue px-4 py-2 text-[13px] font-semibold text-white",
                  "hover:bg-brand-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50",
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
                className="flex w-full items-center justify-between text-left text-[14px] font-medium text-brand-ink"
              >
                How to get an App Password
                {showGoogleGuide ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </SettingsRow>
            {showGoogleGuide && (
              <div className="space-y-2 px-4 pb-4 text-[12px] leading-relaxed text-brand-ink-soft">
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

      <SettingsGroup title="Brand & Campaign" footer="Writer uses this to tailor product language and CTAs for your company. Set how you use the platform, then analyse your website to auto-fill product summary, tone, and Scout targeting.">
        <SettingsRow className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-brand-ink">Company website</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink-soft">
              Used to customise email writing and scout industries / buyer roles
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-[320px]">
            <input
              type="url"
              value={config.brandConfig?.websiteUrl ?? ""}
              onChange={(e) =>
                onUpdate("brandConfig", {
                  ...(config.brandConfig as BrandConfig),
                  websiteUrl: e.target.value,
                })
              }
              placeholder="https://yourcompany.com"
              className={cn(
                "w-full rounded-xl border border-brand-border/60 bg-brand-canvas/50 px-3 py-2 text-[14px] text-brand-ink",
                "focus:border-brand-stratus-blue/50 focus:outline-none focus:ring-2 focus:ring-brand-stratus-blue/15",
              )}
            />
            <button
              type="button"
              disabled={analyzingWebsite || !(config.brandConfig?.websiteUrl ?? "").trim()}
              onClick={() => void analyzeWebsite()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium",
                "bg-brand-black text-white disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {analyzingWebsite ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {analyzingWebsite ? "Analysing…" : "Analyse website"}
            </button>
            {analyzeMessage ? (
              <p className="text-[11px] leading-relaxed text-brand-ink-soft">{analyzeMessage}</p>
            ) : config.brandConfig?.websiteInsights?.analyzedAt ? (
              <p className="text-[11px] text-brand-ink-faint">
                Last analysed {new Date(config.brandConfig.websiteInsights.analyzedAt).toLocaleString()}
                {config.brandConfig.websiteInsights.scoutIndustries?.length
                  ? ` · Scout: ${config.brandConfig.websiteInsights.scoutIndustries.join(", ")}`
                  : ""}
              </p>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsGroupDivider />
        {PLATFORM_INTENT_OPTIONS.map((option, i) => (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            selected={activeIntent === option.value}
            onSelect={() => {
              const next = brandConfigFromPlatformIntent(option.value as PlatformIntent, {
                websiteUrl: config.brandConfig?.websiteUrl,
                websiteInsights: config.brandConfig?.websiteInsights,
                brandName: config.brandConfig?.brandName,
                productSummary: config.brandConfig?.productSummary,
                toneNotes: config.brandConfig?.toneNotes,
                buyerPersonas: config.brandConfig?.buyerPersonas,
              });
              onUpdate("brandConfig", next);
              onUpdate("campaignMode", defaultCampaignModeForIntent(option.value));
            }}
            showDivider={i > 0}
          />
        ))}
        <SettingsGroupDivider />
        {BRAND_PRESET_OPTIONS.map((option, i) => {
          const selectedPack =
            config.brandConfig?.verticalPackId ??
            (config.brandConfig?.brandSlug === "ish"
              ? "gifting-sweets"
              : config.brandConfig?.brandSlug === "prestige"
                ? "gifting-appliances"
                : "general");
          const optionPack =
            option.value === "ish"
              ? "gifting-sweets"
              : option.value === "prestige"
                ? "gifting-appliances"
                : "general";
          return (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            selected={selectedPack === optionPack && (option.value !== "custom" || activeIntent === "general_b2b" || activeIntent === "b2b_saas")}
            onSelect={() => {
              const preset = brandConfigFromPresetSelection(option.value as BrandSlug, {
                websiteUrl: config.brandConfig?.websiteUrl,
                websiteInsights: config.brandConfig?.websiteInsights,
                brandName:
                  option.value === "custom"
                    ? config.brandConfig?.brandName
                    : undefined,
                platformIntent:
                  option.value === "custom"
                    ? activeIntent === "b2b_saas"
                      ? "b2b_saas"
                      : "general_b2b"
                    : undefined,
              });
              onUpdate("brandConfig", preset);
              if (option.value === "ish") onUpdate("campaignMode", "diwali_gifting");
              if (option.value === "prestige") onUpdate("campaignMode", "mass_ordering");
              if (option.value === "custom") onUpdate("campaignMode", "custom");
            }}
            showDivider={i > 0}
          />
          );
        })}
        <SettingsGroupDivider />
        {campaignOptions.map((option, i) => (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            selected={config.campaignMode === option.value}
            onSelect={() => onUpdate("campaignMode", option.value as CampaignMode)}
            showDivider={i > 0}
          />
        ))}
        <SettingsGroupDivider />
        <SettingsTextRow
          label="Product summary"
          desc="Injected into Writer prompts"
          value={config.brandConfig?.productSummary ?? ""}
          onChange={(v) =>
            onUpdate("brandConfig", { ...(config.brandConfig as BrandConfig), productSummary: v })
          }
          placeholder="What you sell and key pricing"
          showDivider
        />
        <SettingsTextRow
          label="Writing style"
          desc="How Writer should sound for your brand (tone, vocabulary, angles)"
          value={config.brandConfig?.toneNotes ?? ""}
          onChange={(v) =>
            onUpdate("brandConfig", { ...(config.brandConfig as BrandConfig), toneNotes: v })
          }
          placeholder="e.g. Clear and product-led. Focus on outcomes, not festival gifting."
          showDivider
        />
      </SettingsGroup>

      <SettingsGroup title="Inbox style" footer="Primary inbox sends personal 1:1 emails. Marketing adds unsubscribe footer and may land in Promotions/Forums.">
        {EMAIL_STYLE_OPTIONS.map((option, i) => (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            badge={option.badge}
            selected={config.emailStyle === option.value}
            onSelect={() => onUpdate("emailStyle", option.value)}
            showDivider={i > 0}
          />
        ))}
        <SettingsGroupDivider />
        <SettingsRow className="flex-col items-stretch gap-1 px-3 py-3">
          <p className="text-[12px] leading-relaxed text-brand-ink-soft">
            Tip: drag a test email to Gmail <strong>Primary</strong> and add the sender to Contacts. Use a company domain for production.
          </p>
        </SettingsRow>
      </SettingsGroup>

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
          placeholder="Your name"
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
        <SettingsTextRow
          label="DKIM selector"
          desc="Optional — from your ESP (e.g. google, default, k1). Improves DKIM detection accuracy."
          value={config.dkimSelector ?? ""}
          onChange={(v) => onUpdate("dkimSelector", v)}
          placeholder="google"
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
        title="Sender health"
        footer="SPF, DMARC, and DKIM checks on your sending domain. Cached for 1 hour.">
        <SenderHealthSettings />
      </SettingsGroup>

      <SettingsGroup
        title="Send limits"
        footer="Live sends are blocked when the daily cap per sending domain is exceeded (critical preflight).">
        <SettingsTextRow
          label="Daily cap per domain"
          desc="Max live sends in a rolling 24h window before preflight blocks"
          value={String(config.dailySendCapPerDomain ?? 50)}
          onChange={(v) => onUpdate("dailySendCapPerDomain", Math.max(1, Number(v) || 50))}
          placeholder="50"
          type="number"
        />
      </SettingsGroup>


      <SettingsGroup
        title="Follow-up policy"
        footer="Controls whether Email 2 and 3 need human review before the sequencer sends them."
      >
        {FOLLOW_UP_POLICY_OPTIONS.map((option, i) => (
          <SettingsSelectRow
            key={option.value}
            label={option.label}
            desc={option.desc}
            selected={(config.followUpPolicy ?? "auto_send") === option.value}
            onSelect={() => onUpdate("followUpPolicy", option.value as FollowUpPolicy)}
            showDivider={i > 0}
          />
        ))}
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
