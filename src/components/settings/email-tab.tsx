"use client";

import { InboxSetupSteps } from "@/components/settings/inbox-setup-steps";
import { MailboxWarmupSettings } from "@/components/settings/mailbox-warmup-settings";
import { SenderHealthSettings } from "@/components/settings/sender-health-settings";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import {
  EMAIL_PROVIDER_OPTIONS,
  EMAIL_SEND_MODE_OPTIONS,
  EMAIL_STYLE_OPTIONS,
  FOLLOW_UP_POLICY_OPTIONS,
  SMTP_SERVER_OPTIONS,
  applySmtpServer,
  smtpServerFromHost,
  type FollowUpPolicy,
  type BrandConfig,
  type BrandSlug,
  type CampaignMode,
  type SmtpServerId,
  type WebsiteBrandInsights,
} from "@/lib/email/config";
import { getOutreachTemplatesForBrand } from "@/lib/email/outreach-templates";
import { campaignModeOptionsForBrand, brandConfigFromPresetSelection, brandConfigFromPlatformIntent } from "@/lib/email/brand-presets";
import {
  defaultCampaignModeForIntent,
  resolvePlatformIntent,
  type PlatformIntent,
} from "@/lib/brand/platform-intent";
import {
  brandPresetOptionsForUser,
  campaignModeOptionsForUser,
  platformIntentOptionsForUser,
} from "@/lib/brand/vertical-catalog";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { useSession } from "@/components/providers/session-provider";
import { isSmtpServerId } from "@/lib/email/inbox-setup-guide";
import { emailKeywordsToInput, normalizeEmailKeywords } from "@/lib/brand/email-keywords";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import {
  SEND_TIMEZONE_OPTIONS,
  WEEKDAY_OPTIONS,
  normalizeSendHourRanges,
  sendWindowSummary,
  type Weekday,
} from "@/lib/email/send-window";
import { HoursRangeSliders } from "@/components/settings/hours-range-sliders";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Loader2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Props = {
  config: EmailConfigResponse | null;
  onUpdate: <K extends keyof EmailConfigResponse>(key: K, value: EmailConfigResponse[K]) => void;
  smtpPassDraft: string;
  onSmtpPassChange: (value: string) => void;
  resendApiKeyDraft: string;
  onResendApiKeyChange: (value: string) => void;
  onVerify: () => void;
  verifying: boolean;
  onChangeAllTemplate?: (templateId: string) => Promise<void>;
};

function AppPasswordHelp({ variant }: { variant: "gmail" | "zoho" }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="How to get an App Password"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-brand-ink-faint",
          "transition-colors hover:bg-brand-canvas hover:text-brand-ink",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/30",
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[min(18rem,calc(100vw-2rem))] min-w-[16rem] rounded-xl border border-brand-stratus-blue/25 bg-white/95 p-3 shadow-[var(--shadow-brand)] backdrop-blur-md"
      >
        <p className="text-[12px] font-semibold text-brand-ink">App Password</p>
        {variant === "zoho" ? (
          <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-brand-ink-soft">
            <p>1. Zoho Mail → Settings → Mail Accounts → your address → enable IMAP Access.</p>
            <p>2. accounts.zoho.in → Security → App Passwords → generate one for Mail.</p>
            <p>3. Paste it here and click Verify inbox. India datacenter: pick Zoho IN.</p>
          </div>
        ) : (
          <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-brand-ink-soft">
            <p>1. Turn on 2-Step Verification.</p>
            <p>2. Google Account → Security → App passwords.</p>
            <p>3. Create one for Mail, then paste it and verify.</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  accessory,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  accessory?: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
        {label}
        {accessory}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
      />
    </label>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-brand-ink-soft">{label}</span>
      <div className="inline-flex items-center rounded-full border border-brand-stratus-blue/20 bg-white/80">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="px-2 py-1 text-[13px] text-brand-ink-soft disabled:opacity-30"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="min-w-[1.5rem] text-center text-[13px] font-semibold tabular-nums text-brand-ink">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="px-2 py-1 text-[13px] text-brand-ink-soft disabled:opacity-30"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ ok, okLabel, failLabel }: { ok: boolean; okLabel: string; failLabel: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-green-soft px-2 py-0.5 text-[10px] font-semibold text-brand-green">
      <CheckCircle2 className="size-3" /> {okLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft px-2 py-0.5 text-[10px] font-semibold text-brand-stratus-salmon">
      <XCircle className="size-3" /> {failLabel}
    </span>
  );
}

function SequenceScheduleSettings({
  config,
  onUpdate,
  showInboxStyle = true,
}: {
  config: EmailConfigResponse;
  onUpdate: Props["onUpdate"];
  showInboxStyle?: boolean;
}) {
  const sendDays = (config.sendDaysOfWeek ?? [1, 2, 3, 4, 5]) as Weekday[];
  const sendHourRanges = normalizeSendHourRanges(
    config.sendHourRanges,
    config.sendHourStart ?? 9,
    config.sendHourEnd ?? 17,
  );
  const sendTimezone = config.sendTimezone ?? "Asia/Kolkata";

  function commitHourRanges(ranges: typeof sendHourRanges) {
    const next = normalizeSendHourRanges(ranges);
    onUpdate("sendHourRanges", next);
    onUpdate("sendHourStart", next[0]!.hourStart);
    onUpdate("sendHourEnd", next[next.length - 1]!.hourEnd);
  }

  return (
    <SettingsGroup title="Sequence" className="mb-4">
      <SettingsRow className="justify-between py-2.5">
        <span className="text-[13px] font-semibold text-brand-ink">Follow-ups</span>
        <SettingsSegmented
          value={(config.followUpPolicy ?? "auto_send") as FollowUpPolicy}
          onChange={(next) => onUpdate("followUpPolicy", next)}
          options={FOLLOW_UP_POLICY_OPTIONS.map((option) => ({
            value: option.value,
            label: option.value === "auto_send" ? "Auto-send" : "Review first",
          }))}
        />
      </SettingsRow>
      <SettingsGroupDivider />
      <SettingsRow className="justify-between py-2.5">
        <span className="text-[13px] font-semibold text-brand-ink">Cadence</span>
        <div className="flex flex-wrap items-center gap-3">
          <Stepper
            label="Email 2"
            value={config.cadenceDays[0]}
            min={1}
            max={14}
            onChange={(v) => onUpdate("cadenceDays", [v, Math.max(v + 1, config.cadenceDays[1])])}
          />
          <Stepper
            label="Email 3"
            value={config.cadenceDays[1]}
            min={Math.max(2, config.cadenceDays[0] + 1)}
            max={30}
            onChange={(v) => onUpdate("cadenceDays", [config.cadenceDays[0], v])}
          />
          <span className="text-[11px] text-brand-ink-faint">days after Email 1</span>
        </div>
      </SettingsRow>
      <SettingsGroupDivider />
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[13px] font-semibold text-brand-ink">Shoot to</span>
            <p className="mt-0.5 text-[11px] text-brand-ink-faint">
              Follow-ups only send on these days and hours. Outside the window, they roll to the next slot.
            </p>
          </div>
          <span className="max-w-[14rem] text-right text-[10px] leading-snug text-brand-ink-faint">
            {sendWindowSummary({
              daysOfWeek: sendDays,
              hourRanges: sendHourRanges,
              timezone: sendTimezone,
            })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {WEEKDAY_OPTIONS.map((day) => {
            const selected = sendDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  const next = selected
                    ? sendDays.filter((d) => d !== day.value)
                    : [...sendDays, day.value].sort((a, b) => a - b);
                  if (next.length === 0) return;
                  onUpdate("sendDaysOfWeek", next);
                }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  selected
                    ? "bg-brand-stratus-blue text-white shadow-[var(--shadow-brand-sm)]"
                    : "border border-brand-stratus-blue/20 bg-white/80 text-brand-ink-soft hover:border-brand-stratus-blue/40 hover:text-brand-ink",
                )}
              >
                {day.short}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <HoursRangeSliders ranges={sendHourRanges} onChange={commitHourRanges} />
        </div>
        <div className="mt-3">
          <label className="block min-w-0 sm:max-w-xs">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
              Timezone
            </span>
            <select
              value={sendTimezone}
              onChange={(e) => onUpdate("sendTimezone", e.target.value)}
              className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none"
            >
              {SEND_TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {showInboxStyle ? (
        <>
          <SettingsGroupDivider />
          <SettingsRow className="justify-between py-2.5">
            <div className="min-w-0 pr-3">
              <span className="text-[13px] font-semibold text-brand-ink">Inbox</span>
              <p className="mt-0.5 text-[11px] text-brand-ink-faint">
                Primary for company cold outreach. Marketing adds unsubscribe headers that push Promotions.
              </p>
            </div>
            <SettingsSegmented
              value={config.emailStyle}
              onChange={(next) => onUpdate("emailStyle", next)}
              options={EMAIL_STYLE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.value === "primary" ? "Primary" : option.label,
              }))}
            />
          </SettingsRow>
        </>
      ) : null}
    </SettingsGroup>
  );
}

export function EmailTab({
  config,
  onUpdate,
  smtpPassDraft,
  onSmtpPassChange,
  resendApiKeyDraft,
  onResendApiKeyChange,
  onVerify,
  verifying,
  onChangeAllTemplate,
}: Props) {
  const [analyzingWebsite, setAnalyzingWebsite] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState("");
  const [keywordDraft, setKeywordDraft] = useState<string | null>(null);
  const [showWriter, setShowWriter] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [changingAll, setChangingAll] = useState(false);
  const savedCtaRef = useRef<string | null>(null);
  const { session } = useSession();
  const operatorEmail = session?.user.email;

  useEffect(() => {
    if (config && savedCtaRef.current === null) {
      savedCtaRef.current = config.brandConfig?.defaultOutreachCta ?? "";
    }
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const mail = new URLSearchParams(window.location.search).get("mail");
    if (!isSmtpServerId(mail)) return;
    const patch = applySmtpServer(mail);
    if (
      config.provider === "smtp" &&
      config.smtpHost === patch.smtpHost &&
      config.smtpPort === patch.smtpPort &&
      config.smtpSecure === patch.smtpSecure
    ) {
      return;
    }
    onUpdate("provider", "smtp");
    onUpdate("smtpHost", patch.smtpHost);
    onUpdate("smtpPort", patch.smtpPort);
    onUpdate("smtpSecure", patch.smtpSecure);
  }, [config, onUpdate]);

  const intentOptions = useMemo(
    () => platformIntentOptionsForUser(operatorEmail),
    [operatorEmail],
  );
  const presetOptions = useMemo(
    () => brandPresetOptionsForUser(operatorEmail),
    [operatorEmail],
  );
  const campaignOptions = useMemo(
    () => campaignModeOptionsForUser(campaignModeOptionsForBrand(config?.brandConfig), operatorEmail),
    [config?.brandConfig, operatorEmail],
  );

  const activeIntent = resolvePlatformIntent(
    config?.brandConfig?.platformIntent,
    config?.brandConfig?.verticalPackId ?? config?.brandConfig?.brandSlug,
  );

  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-brand-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading email settings…
      </div>
    );
  }

  const isSmtp = config.provider === "smtp";
  const isResend = config.provider === "resend";
  const smtpServer = smtpServerFromHost(config.smtpHost);
  const isZoho = smtpServer === "zoho_in" || smtpServer === "zoho_com";
  const resendReady = Boolean(config.resendApiKeySet || resendApiKeyDraft.trim());
  const providerReady = isSmtp ? config.smtpConfigured : resendReady;
  const canSelectLive = config.sendMode === "live" || providerReady;
  const smtpEmail = config.smtpUser || "";
  const simpleInbox = session?.role === "admin" && !session.isSuperadmin;
  const selectedPack =
    config.brandConfig?.verticalPackId ??
    (config.brandConfig?.brandSlug === "ish"
      ? "gifting-sweets"
      : config.brandConfig?.brandSlug === "prestige"
        ? "gifting-appliances"
        : "general");

  function patchWebsiteInsights(partial: Partial<WebsiteBrandInsights>) {
    if (!config) return;
    const current = config.brandConfig as BrandConfig;
    const base: WebsiteBrandInsights = current.websiteInsights ?? {
      analyzedAt: new Date().toISOString(),
      vertical: current.vertical || "general",
      productSummary: current.productSummary || "",
      toneNotes: current.toneNotes || "",
      buyerPersonas: current.buyerPersonas ?? [],
      scoutIndustries: [],
      scoutDepartments: [],
      scoutSeniority: [],
    };
    onUpdate("brandConfig", {
      ...current,
      websiteInsights: { ...base, ...partial },
    });
  }

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
      setAnalyzeMessage("Enter a website first.");
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
      if (data.brandConfig) onUpdate("brandConfig", data.brandConfig as BrandConfig);
      if (data.campaignMode) onUpdate("campaignMode", data.campaignMode as CampaignMode);
      setAnalyzeMessage("Writer copy updated from your website.");
      setShowWriter(true);
    } catch {
      setAnalyzeMessage("Website analysis failed. Try again.");
    } finally {
      setAnalyzingWebsite(false);
    }
  }

  if (simpleInbox) {
    const sendMode = config.sendMode === "live" ? "live" : "test";
    return (
      <div className="ish-email-settings pb-6">
        {config.validationWarnings.length > 0 ? (
          <div className="mb-4 rounded-xl border border-brand-stratus-salmon/30 bg-brand-pink-soft/40 px-4 py-3">
            <div className="flex items-start gap-2 text-[12px] leading-relaxed text-brand-stratus-salmon">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <ul className="space-y-0.5">
                {config.validationWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <SettingsGroup
          title="Your inbox"
          footer="Use a Zoho or Gmail App Password. Your normal mailbox password will not work."
          className="mb-4"
        >
          <SettingsRow className="justify-between py-2.5">
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink">
              Mail host
              <InboxSetupSteps mailHost={smtpServer} />
            </span>
            <SettingsSegmented
              value={smtpServer}
              onChange={(next) => {
                onUpdate("provider", "smtp");
                const patch = applySmtpServer(next as SmtpServerId);
                onUpdate("smtpHost", patch.smtpHost);
                onUpdate("smtpPort", patch.smtpPort);
                onUpdate("smtpSecure", patch.smtpSecure);
              }}
              options={SMTP_SERVER_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label === "Zoho India" ? "Zoho IN" : option.label,
              }))}
            />
          </SettingsRow>
          <SettingsGroupDivider />
          <div className="flex items-center justify-between gap-2 px-4 py-2.5">
            <p className="min-w-0 text-[12px] text-brand-ink-soft">{config.smtpHint}</p>
            <StatusBadge ok={config.smtpConfigured} okLabel="Send OK" failLabel="Send failed" />
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-1">
            <p className="min-w-0 text-[12px] text-brand-ink-soft">{config.imapHint}</p>
            <StatusBadge ok={config.imapConfigured} okLabel="Sync OK" failLabel="Sync failed" />
          </div>
          <div className="space-y-3 px-4 pb-3">
            <Field
              label={isZoho ? "Work email" : "Gmail"}
              value={config.smtpUser}
              onChange={handleSmtpUserChange}
              placeholder={isZoho ? "you@company.com" : "you@gmail.com"}
              type="email"
            />
            <Field
              label="App Password"
              accessory={<AppPasswordHelp variant={isZoho ? "zoho" : "gmail"} />}
              value={smtpPassDraft}
              onChange={onSmtpPassChange}
              placeholder={config.smtpPassSet ? "••••••••••••••••" : "Paste App Password"}
              type="password"
            />
            <button
              type="button"
              onClick={onVerify}
              disabled={verifying || !config.smtpUser}
              className="h-[38px] w-full rounded-full bg-brand-stratus-blue px-4 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:bg-brand-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {verifying ? "Verifying…" : "Verify inbox"}
            </button>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Send outreach" footer="Test sends to your test inbox first. Switch to Live when mail arrives." className="mb-4">
          <SettingsRow className="justify-between py-2.5">
            <span className="text-[13px] font-semibold text-brand-ink">Mode</span>
            <SettingsSegmented
              value={sendMode}
              onChange={(next) => onUpdate("sendMode", next)}
              options={[
                { value: "test", label: "Test" },
                { value: "live", label: "Live" },
              ]}
              disabledValue={canSelectLive ? undefined : "live"}
            />
          </SettingsRow>
          <SettingsGroupDivider />
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            <Field
              label="From name"
              value={config.fromName}
              onChange={(v) => onUpdate("fromName", v)}
              placeholder="Your name"
            />
            <Field
              label="From location"
              value={config.fromLocation ?? ""}
              onChange={(v) => onUpdate("fromLocation", v)}
              placeholder="e.g. Kasturinagar"
            />
            <Field
              label="From phone"
              value={config.fromPhone ?? ""}
              onChange={(v) => onUpdate("fromPhone", v)}
              placeholder="+91 98XXX XXXXX"
            />
            <Field
              label="From email"
              value={config.fromAddress}
              onChange={(v) => onUpdate("fromAddress", v)}
              placeholder={smtpEmail || "you@company.com"}
              type="email"
            />
            {sendMode === "test" ? (
              <Field
                label="Test inbox"
                value={config.testRecipient}
                onChange={(v) => onUpdate("testRecipient", v)}
                placeholder={smtpEmail || "you@company.com"}
                type="email"
              />
            ) : null}
          </div>
          <SettingsGroupDivider />
          <div className="px-4 py-3">
            <label className="block min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                Signature
              </span>
              <textarea
                value={config.signature ?? ""}
                onChange={(e) => onUpdate("signature", e.target.value)}
                placeholder={"Arun Murugesan\nSales · India Sweet House\n+91 98XXX XXXXX"}
                rows={3}
                className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-brand-ink-faint">
                Used as the sign-off identity on generated drafts (under Warmly / Thanks & Regards). Also
                appended on send if the body does not already include it.
              </p>
            </label>
          </div>
        </SettingsGroup>

        <SequenceScheduleSettings config={config} onUpdate={onUpdate} showInboxStyle={false} />

        <MailboxWarmupSettings config={config} onUpdate={onUpdate} />
      </div>
    );
  }

  return (
    <div className="ish-email-settings pb-6">
      {config.validationWarnings.length > 0 && (
        <div className="mb-3 rounded-xl border border-brand-stratus-salmon/30 bg-brand-pink-soft/40 px-3 py-2">
          <div className="flex items-start gap-2 text-[12px] text-brand-stratus-salmon">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <ul className="space-y-0.5">
              {config.validationWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <SettingsGroup title="Sending" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Status</span>
          <SettingsSegmented
            value={config.outreachPaused ? "paused" : "active"}
            onChange={(next) => onUpdate("outreachPaused", next === "paused")}
            options={[
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
            ]}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Mode</span>
          <SettingsSegmented
            value={config.sendMode}
            onChange={(next) => onUpdate("sendMode", next)}
            options={EMAIL_SEND_MODE_OPTIONS.map((mode) => ({ value: mode.value, label: mode.label }))}
            disabledValue={canSelectLive ? undefined : "live"}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <Field
            label="From name"
            value={config.fromName}
            onChange={(v) => onUpdate("fromName", v)}
            placeholder="Arun (your real name)"
          />
          <Field
            label="From location"
            value={config.fromLocation ?? ""}
            onChange={(v) => onUpdate("fromLocation", v)}
            placeholder="e.g. Kasturinagar"
          />
          <Field
            label="From phone"
            value={config.fromPhone ?? ""}
            onChange={(v) => onUpdate("fromPhone", v)}
            placeholder="+91 98XXX XXXXX"
          />
          <Field
            label="From email"
            value={config.fromAddress}
            onChange={(v) => {
              onUpdate("fromAddress", v);
              if (isResend && v.includes("@") && !config.replyToAddress?.trim()) {
                onUpdate("replyToAddress", v);
              }
            }}
            placeholder={isSmtp ? smtpEmail || "you@company.com" : "hello@yourdomain.com"}
            type="email"
          />
          {(config.sendMode === "test" || config.testRecipient) && (
            <Field
              label="Test inbox"
              value={config.testRecipient}
              onChange={(v) => onUpdate("testRecipient", v)}
              placeholder="you@gmail.com"
              type="email"
            />
          )}
        </div>
        <SettingsGroupDivider />
        <div className="px-4 py-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
              Signature
            </span>
            <textarea
              value={config.signature ?? ""}
              onChange={(e) => onUpdate("signature", e.target.value)}
              placeholder={"Arun Murugesan\nSales · India Sweet House\n+91 98XXX XXXXX"}
              rows={3}
              className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-ink-faint">
              Used as the sign-off identity on generated drafts (under Warmly / Thanks & Regards). Also
              appended on send if the body does not already include it.
            </p>
          </label>
        </div>
      </SettingsGroup>

      <MailboxWarmupSettings config={config} onUpdate={onUpdate} />

      <SettingsGroup title="Connection" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Provider</span>
          <SettingsSegmented
            value={config.provider}
            onChange={(next) => onUpdate("provider", next)}
            options={EMAIL_PROVIDER_OPTIONS.map((option) => ({
              value: option.value,
              label: option.value === "smtp" ? "Inbox" : option.label,
            }))}
          />
        </SettingsRow>
        {isSmtp ? (
          <>
            <SettingsGroupDivider />
            <SettingsRow className="justify-between py-2.5">
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink">
                Mail host
                <InboxSetupSteps mailHost={smtpServer} />
              </span>
              <SettingsSegmented
                value={smtpServer}
                onChange={(next) => {
                  const patch = applySmtpServer(next as SmtpServerId);
                  onUpdate("smtpHost", patch.smtpHost);
                  onUpdate("smtpPort", patch.smtpPort);
                  onUpdate("smtpSecure", patch.smtpSecure);
                }}
                options={SMTP_SERVER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </SettingsRow>
            <SettingsGroupDivider />
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <p className="min-w-0 truncate text-[12px] text-brand-ink-soft">{config.smtpHint}</p>
              <StatusBadge ok={config.smtpConfigured} okLabel="Send OK" failLabel="Send failed" />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 pb-1">
              <p className="min-w-0 truncate text-[12px] text-brand-ink-soft">{config.imapHint}</p>
              <StatusBadge ok={config.imapConfigured} okLabel="Sync OK" failLabel="Sync failed" />
            </div>
            <div className="grid gap-3 px-4 pb-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field
                label={isZoho ? "Zoho email" : "Gmail"}
                value={config.smtpUser}
                onChange={handleSmtpUserChange}
                placeholder={isZoho ? "you@company.com" : "you@gmail.com"}
                type="email"
              />
              <Field
                label="App Password"
                accessory={<AppPasswordHelp variant={isZoho ? "zoho" : "gmail"} />}
                value={smtpPassDraft}
                onChange={onSmtpPassChange}
                placeholder={config.smtpPassSet ? "••••••••••••••••" : "xxxx xxxx xxxx xxxx"}
                type="password"
              />
              <button
                type="button"
                onClick={onVerify}
                disabled={verifying || !config.smtpUser}
                className="h-[38px] rounded-full bg-brand-stratus-blue px-4 text-[12px] font-semibold text-white hover:bg-brand-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </div>
          </>
        ) : null}
        {isResend ? (
          <>
            <SettingsGroupDivider />
            <div className="px-4 py-3">
              <Field
                label="Resend API key"
                value={resendApiKeyDraft}
                onChange={onResendApiKeyChange}
                placeholder={config.resendApiKeySet ? "•••••••• (saved)" : "re_..."}
                type="password"
              />
            </div>
          </>
        ) : null}
      </SettingsGroup>

      <SequenceScheduleSettings config={config} onUpdate={onUpdate} />

      <SettingsGroup title="Writer" className="mb-4">
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field
            label="Website"
            value={config.brandConfig?.websiteUrl ?? ""}
            onChange={(v) =>
              onUpdate("brandConfig", {
                ...(config.brandConfig as BrandConfig),
                websiteUrl: v,
              })
            }
            placeholder="https://yourcompany.com"
            type="url"
          />
          <button
            type="button"
            disabled={analyzingWebsite || !(config.brandConfig?.websiteUrl ?? "").trim()}
            onClick={() => void analyzeWebsite()}
            className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-full bg-brand-black px-4 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzingWebsite ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {analyzingWebsite ? "Analysing…" : "Analyse"}
          </button>
        </div>
        {analyzeMessage || config.brandConfig?.websiteInsights?.analyzedAt ? (
          <p className="px-4 pb-2 text-[11px] text-brand-ink-faint">
            {analyzeMessage ||
              `Last analysed ${new Date(config.brandConfig!.websiteInsights!.analyzedAt).toLocaleDateString()}`}
          </p>
        ) : null}
        <SettingsGroupDivider />
        {(() => {
          const email1Templates = getOutreachTemplatesForBrand(config.brandConfig).filter(
            (t) => t.id !== "follow_up" && t.id !== "final_reminder",
          );
          const currentCta = config.brandConfig?.defaultOutreachCta ?? email1Templates[0]?.id ?? "";
          const ctaChanged = savedCtaRef.current !== null && savedCtaRef.current !== currentCta;
          if (email1Templates.length < 2) return null;
          return (
            <>
              <SettingsRow className="justify-between py-2.5">
                <div className="min-w-0 pr-3">
                  <span className="text-[13px] font-semibold text-brand-ink">Email 1 Template</span>
                  <p className="mt-0.5 text-[11px] text-brand-ink-faint">
                    Default CTA used by the Writer when generating the first email.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SettingsSegmented
                    value={currentCta}
                    onChange={(next) =>
                      onUpdate("brandConfig", {
                        ...(config.brandConfig as BrandConfig),
                        defaultOutreachCta: next,
                      })
                    }
                    options={email1Templates.map((t) => ({
                      value: t.id,
                      label: t.shortLabel ?? t.label,
                    }))}
                  />
                  {onChangeAllTemplate && ctaChanged ? (
                    <button
                      type="button"
                      disabled={changingAll}
                      onClick={async () => {
                        setChangingAll(true);
                        try {
                          await onChangeAllTemplate(currentCta);
                          savedCtaRef.current = currentCta;
                        } finally {
                          setChangingAll(false);
                        }
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-brand-stratus-blue px-3 text-[11px] font-semibold text-white shadow-[var(--shadow-brand-sm)] hover:bg-brand-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {changingAll ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : null}
                      {changingAll ? "Changing…" : "Change All"}
                    </button>
                  ) : null}
                </div>
              </SettingsRow>
              <SettingsGroupDivider />
            </>
          );
        })()}
        <button
          type="button"
          onClick={() => setShowWriter((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[12px] font-semibold text-brand-ink-soft hover:text-brand-ink"
        >
          Edit writer copy
          <ChevronDown className={cn("size-3.5 transition-transform", showWriter && "rotate-180")} />
        </button>
        {showWriter ? (
          <div className="grid gap-3 px-4 pb-3">
            <Field
              label="Product summary"
              value={config.brandConfig?.productSummary ?? ""}
              onChange={(v) =>
                onUpdate("brandConfig", { ...(config.brandConfig as BrandConfig), productSummary: v })
              }
              placeholder="What you sell"
            />
            <label className="block min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                Writeup
              </span>
              <textarea
                value={config.brandConfig?.websiteInsights?.productWriteup ?? ""}
                onChange={(e) => patchWebsiteInsights({ productWriteup: e.target.value })}
                placeholder="2-3 sentences for Writer"
                rows={2}
                className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                Who you sell to
              </span>
              <textarea
                value={config.brandConfig?.websiteInsights?.icpSummary ?? ""}
                onChange={(e) => patchWebsiteInsights({ icpSummary: e.target.value })}
                placeholder="Companies that gift sweets to employees, or companies that would buy this software"
                rows={2}
                className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
              />
            </label>
            <Field
              label="Keywords"
              value={keywordDraft ?? emailKeywordsToInput(config.brandConfig?.websiteInsights?.emailKeywords)}
              onChange={setKeywordDraft}
              onBlur={() => {
                const next = normalizeEmailKeywords(
                  keywordDraft ?? emailKeywordsToInput(config.brandConfig?.websiteInsights?.emailKeywords),
                );
                patchWebsiteInsights({ emailKeywords: next });
                setKeywordDraft(null);
              }}
              placeholder="bulk hampers, branded boxes"
            />
            <Field
              label="Writing style"
              value={config.brandConfig?.toneNotes ?? ""}
              onChange={(v) =>
                onUpdate("brandConfig", { ...(config.brandConfig as BrandConfig), toneNotes: v })
              }
              placeholder="Clear, product-led"
            />
          </div>
        ) : null}
      </SettingsGroup>

      <button
        type="button"
        onClick={() => setShowAdvanced((open) => !open)}
        className="mb-3 flex w-full items-center justify-between rounded-2xl border border-brand-stratus-blue/20 bg-white/70 px-4 py-2.5 text-[12px] font-semibold text-brand-ink-soft shadow-[var(--shadow-brand-sm)] backdrop-blur-sm hover:text-brand-ink"
      >
        Advanced
        <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
      </button>

      {showAdvanced ? (
        <SettingsGroup className="mb-4">
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
            <Field
              label="Reply-to"
              value={config.replyToAddress}
              onChange={(v) => onUpdate("replyToAddress", v)}
              placeholder={config.fromAddress || "you@company.com"}
              type="email"
            />
            <Field
              label="DKIM selector"
              value={config.dkimSelector ?? ""}
              onChange={(v) => onUpdate("dkimSelector", v)}
              placeholder="google"
            />
            <Field
              label="App URL"
              value={config.appUrl}
              onChange={(v) => onUpdate("appUrl", v)}
              placeholder="https://your-app.vercel.app"
            />
            {intentOptions.length > 1 ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Intent
                </span>
                <select
                  value={activeIntent}
                  onChange={(e) => {
                    const nextIntent = e.target.value as PlatformIntent;
                    const next = brandConfigFromPlatformIntent(nextIntent, {
                      websiteUrl: config.brandConfig?.websiteUrl,
                      websiteInsights: config.brandConfig?.websiteInsights,
                      brandName: config.brandConfig?.brandName,
                      productSummary: config.brandConfig?.productSummary,
                      toneNotes: config.brandConfig?.toneNotes,
                      buyerPersonas: config.brandConfig?.buyerPersonas,
                    });
                    onUpdate("brandConfig", next);
                    onUpdate("campaignMode", defaultCampaignModeForIntent(nextIntent));
                  }}
                  className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none"
                >
                  {intentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {presetOptions.length > 1 ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Brand pack
                </span>
                <select
                  value={
                    presetOptions.find((option) => {
                      const optionPack =
                        option.value === "ish"
                          ? "gifting-sweets"
                          : option.value === "prestige"
                            ? "gifting-appliances"
                            : "general";
                      return (
                        selectedPack === optionPack &&
                        (option.value !== "custom" || activeIntent === "general_b2b" || activeIntent === "b2b_saas")
                      );
                    })?.value ?? "custom"
                  }
                  onChange={(e) => {
                    const value = e.target.value as BrandSlug;
                    const preset = brandConfigFromPresetSelection(value, {
                      websiteUrl: config.brandConfig?.websiteUrl,
                      websiteInsights: config.brandConfig?.websiteInsights,
                      brandName: value === "custom" ? config.brandConfig?.brandName : undefined,
                      platformIntent:
                        value === "custom"
                          ? activeIntent === "b2b_saas"
                            ? "b2b_saas"
                            : "general_b2b"
                          : undefined,
                    });
                    onUpdate("brandConfig", preset);
                    if (value === "ish") onUpdate("campaignMode", "diwali_gifting");
                    if (value === "prestige") onUpdate("campaignMode", "mass_ordering");
                    if (value === "custom") onUpdate("campaignMode", "custom");
                  }}
                  className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none"
                >
                  {presetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {campaignOptions.length > 1 ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Campaign
                </span>
                <select
                  value={config.campaignMode}
                  onChange={(e) => onUpdate("campaignMode", e.target.value as CampaignMode)}
                  className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none"
                >
                  {campaignOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <label className="mt-3 block min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
              Campaign notes
            </span>
            <textarea
              value={config.campaignNotes ?? ""}
              onChange={(e) => onUpdate("campaignNotes", e.target.value)}
              rows={2}
              placeholder="Optional monthly theme, e.g. birthday boxes for September"
              className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none"
            />
          </label>
          <SettingsGroupDivider />
          <SenderHealthSettings />
        </SettingsGroup>
      ) : null}
    </div>
  );
}
