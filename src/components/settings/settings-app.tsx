"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { SettingsHero } from "@/components/settings/settings-hero";
import { EnrichmentTab } from "@/components/settings/enrichment-tab";
import { EmailTab } from "@/components/settings/email-tab";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { AiUsageTab } from "@/components/settings/ai-usage-tab";
import { LinkedInIntegration } from "@/components/settings/linkedin-integration";
import { TeamTab } from "@/components/settings/team-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { cn } from "@/lib/utils";
import { ListGroup, ListRow, MobileHeader, MobileStackLayout } from "@/design-system";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { Loader2, Mail, Palette, Plug, Save, Sparkles, Users, Wrench, CreditCard } from "lucide-react";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import { toast } from "sonner";

const ALL_NAV_ITEMS: SettingsNavItem[] = [
  { value: "enrichment", label: "Enrichment", icon: Wrench },
  { value: "email", label: "Email", icon: Mail },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "team", label: "Team", icon: Users },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "ai-usage", label: "Platform Keys", icon: Sparkles },
  { value: "appearance", label: "Appearance", icon: Palette },
];

const TAB_SUBTITLES: Record<string, string> = {
  enrichment: "Configure search, enrichment, and scout volume",
  email: "SMTP, send mode, cadence, and open tracking",
  billing: "Plan, credits, top-ups, and subscription",
  team: "Invite teammates to your workspace",
  integrations: "LinkedIn and external connections",
  "ai-usage": "Platform API key status (superadmin only)",
  appearance: "Theme and visual preferences",
};

function SettingsAppInner() {
  const isMobileLayout = useIsMobileLayout();
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const router = useRouter();
  const { session: me } = useSession();
  const session = me
    ? {
        isSuperadmin: me.isSuperadmin,
        role: me.role,
        canManageTeam: me.permissions.canManageTeam,
      }
    : null;

  const NAV_ITEMS = ALL_NAV_ITEMS.filter((item) => {
    if (item.value === "ai-usage") return session?.isSuperadmin === true;
    if (item.value === "billing") return session?.role === "owner" || session?.isSuperadmin === true;
    if (item.value === "team") return session?.canManageTeam === true;
    if (item.value === "email" || item.value === "enrichment") {
      return session?.role === "owner" || session?.role === "admin" || session?.isSuperadmin === true;
    }
    return true;
  });
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "enrichment");
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [smtpPassDraft, setSmtpPassDraft] = useState("");
  const [resendApiKeyDraft, setResendApiKeyDraft] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [scoutVolumeDirty, setScoutVolumeDirty] = useState(false);
  const [savingVolume, setSavingVolume] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setConfig(data));
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        setEmailConfig(data);
        setSmtpPassDraft("");
        setResendApiKeyDraft("");
      });
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      router.replace(`/settings?tab=${tab}`, { scroll: false });
      if (isMobileLayout) setMobileShowDetail(true);
    },
    [router, isMobileLayout],
  );

  function update<K extends keyof EnrichmentConfig>(key: K, value: EnrichmentConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  function updateEmail<K extends keyof EmailConfigResponse>(key: K, value: EmailConfigResponse[K]) {
    setEmailConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    setEmailDirty(true);
  }

  function handleSmtpPassChange(value: string) {
    setSmtpPassDraft(value);
    setEmailDirty(true);
  }

  function handleResendApiKeyChange(value: string) {
    setResendApiKeyDraft(value);
    setEmailDirty(true);
  }

  function updateScoutVolume(partial: Pick<EnrichmentConfig, "scoutCompaniesLimit" | "scoutLeadsLimit">) {
    setConfig((prev) => (prev ? { ...prev, ...partial } : prev));
    setScoutVolumeDirty(true);
    setDirty(true);
  }

  async function saveScoutVolume() {
    if (!config) return;
    setSavingVolume(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoutCompaniesLimit: config.scoutCompaniesLimit,
          scoutLeadsLimit: config.scoutLeadsLimit,
        }),
      });
      setScoutVolumeDirty(false);
      window.dispatchEvent(
        new CustomEvent("scout-volume-updated", {
          detail: {
            scoutCompaniesLimit: config.scoutCompaniesLimit,
            scoutLeadsLimit: config.scoutLeadsLimit,
          },
        }),
      );
      toast.success("Scout volume saved — applies to the next scout run");
    } catch {
      toast.error("Could not save scout volume");
    } finally {
      setSavingVolume(false);
    }
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setDirty(false);
      setScoutVolumeDirty(false);
      window.dispatchEvent(
        new CustomEvent("scout-volume-updated", {
          detail: {
            scoutCompaniesLimit: config.scoutCompaniesLimit,
            scoutLeadsLimit: config.scoutLeadsLimit,
          },
        }),
      );
      toast.success("Settings saved — applies to next Scout run");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }



  async function verifyEmail() {
    if (!emailConfig) return;
    setVerifyingEmail(true);
    try {
      const {
        smtpConfigured,
        smtpHint,
        smtpPassSet,
        resendApiKeySet,
        resendConfigured,
        resendHint,
        validationWarnings,
        ...payload
      } = emailConfig;
      const res = await fetch("/api/settings/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(smtpPassDraft.trim() ? { smtpPass: smtpPassDraft.trim() } : {}),
          ...(resendApiKeyDraft.trim() ? { resendApiKey: resendApiKeyDraft.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Verification failed");
        return;
      }
      if (data.config) {
        setEmailConfig(data.config);
        setSmtpPassDraft("");
        setResendApiKeyDraft("");
        setEmailDirty(false);
      }
      if (data.config?.smtpConfigured) {
        toast.success("SMTP connection verified and saved");
      } else {
        toast.error(data.config?.smtpHint ?? "SMTP connection not verified");
      }
    } catch {
      toast.error("Could not verify SMTP connection");
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function saveEmail() {
    if (!emailConfig) return;
    setSaving(true);
    try {
      const {
        smtpConfigured,
        smtpHint,
        smtpPassSet,
        resendApiKeySet,
        resendConfigured,
        resendHint,
        validationWarnings,
        ...payload
      } = emailConfig;
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(smtpPassDraft.trim() ? { smtpPass: smtpPassDraft.trim() } : {}),
          ...(resendApiKeyDraft.trim() ? { resendApiKey: resendApiKeyDraft.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = Array.isArray(data.errors) ? data.errors.join("; ") : data.error ?? "Could not save email settings";
        toast.error(message);
        return;
      }
      if (data.config) setEmailConfig(data.config);
      setSmtpPassDraft("");
      setEmailDirty(false);
      toast.success("Email settings saved");
    } catch {
      toast.error("Could not save email settings");
    } finally {
      setSaving(false);
    }
  }

  const saveAction =
    activeTab === "enrichment" || activeTab === "email" ? (
      <button
        type="button"
        onClick={activeTab === "email" ? saveEmail : save}
        disabled={
          activeTab === "email"
            ? (!emailDirty && !smtpPassDraft.trim() && !resendApiKeyDraft.trim()) || saving || !emailConfig
            : !dirty || saving || !config
        }
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-[var(--shadow-ish-sm)] transition-all lg:px-4 lg:py-2",
          (activeTab === "email" ? (emailDirty || smtpPassDraft.trim() || resendApiKeyDraft.trim()) && emailConfig : dirty && config) && !saving
            ? "bg-ish-black text-white hover:opacity-90"
            : "cursor-not-allowed bg-white/60 text-ish-ink-faint opacity-60",
        )}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        <span className="hidden sm:inline">{saving ? "Saving…" : "Save"}</span>
      </button>
    ) : null;

  const settingsList = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ish-canvas lg:hidden">
      <MobileHeader title="Settings" subtitle="Workspace preferences" largeTitle />
      <div className="ish-page-padding flex-1 overflow-y-auto py-4">
        <ListGroup>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <ListRow
                key={item.value}
                title={item.label}
                subtitle={TAB_SUBTITLES[item.value]}
                icon={<Icon className="size-[18px]" />}
                showChevron
                onClick={() => handleTabChange(item.value)}
              />
            );
          })}
        </ListGroup>
      </div>
    </div>
  );

  const settingsDetail = (
      <div className="settings-content settings-ambient flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {isMobileLayout ? (
          <MobileHeader
            title={NAV_ITEMS.find((i) => i.value === activeTab)?.label ?? "Settings"}
            subtitle={TAB_SUBTITLES[activeTab]}
            showBack
            onBack={() => setMobileShowDetail(false)}
            rightSlot={saveAction}
          />
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-10 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-2xl">
            <div className="hidden lg:block">
              {(() => {
                const item = NAV_ITEMS.find((i) => i.value === activeTab);
                const Icon = item?.icon ?? Wrench;
                return (
                  <SettingsHero
                    icon={Icon}
                    title={item?.label ?? "Settings"}
                    subtitle={TAB_SUBTITLES[activeTab] ?? ""}
                    action={saveAction}
                  />
                );
              })()}
            </div>
          <div key={activeTab} className="animate-ish-tab-in">
          {activeTab === "enrichment" && (
            <EnrichmentTab
              config={config}
              scoutVolumeDirty={scoutVolumeDirty}
              savingVolume={savingVolume}
              onUpdate={update}
              onUpdateScoutVolume={updateScoutVolume}
              onSaveScoutVolume={saveScoutVolume}
            />
          )}

          {activeTab === "email" && (
            <EmailTab config={emailConfig} onUpdate={updateEmail} smtpPassDraft={smtpPassDraft} onSmtpPassChange={handleSmtpPassChange} resendApiKeyDraft={resendApiKeyDraft} onResendApiKeyChange={handleResendApiKeyChange} onVerify={verifyEmail} verifying={verifyingEmail} />
          )}

          {activeTab === "billing" && <BillingTab />}
          {activeTab === "team" && <TeamTab />}

          {activeTab === "integrations" && (
            <Suspense fallback={<div className="py-12 text-center text-ish-ink-faint">Loading…</div>}>
              <LinkedInIntegration />
            </Suspense>
          )}

          {activeTab === "ai-usage" && <AiUsageTab />}

          {activeTab === "appearance" && <AppearanceTab />}
          </div>
          </div>
        </div>
      </div>
  );

  return isMobileLayout ? (
    <MobileStackLayout
      showDetail={mobileShowDetail}
      list={settingsList}
      detail={settingsDetail}
    />
  ) : (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <SettingsNav value={activeTab} onChange={handleTabChange} items={NAV_ITEMS} />
      {settingsDetail}
    </div>
  );
}

export function SettingsApp() {
  return (
    <Suspense fallback={<div className="min-w-0 flex-1 p-8 text-ish-ink-faint">Loading settings…</div>}>
      <SettingsAppInner />
    </Suspense>
  );
}
