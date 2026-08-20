"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { SettingsNav, type SettingsNavItem } from "@/components/settings/settings-nav";
import { UnsavedChangesModal } from "@/components/settings/unsaved-changes-modal";
import { EnrichmentTab } from "@/components/settings/enrichment-tab";
import { SettingsStickySaveBar } from "@/components/settings/settings-sticky-save-bar";
import { EmailTab } from "@/components/settings/email-tab";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { AiUsageTab } from "@/components/settings/ai-usage-tab";
import { LinkedInIntegration } from "@/components/settings/linkedin-integration";
import { WhatsAppIntegration } from "@/components/settings/whatsapp-integration";
import { TeamTab } from "@/components/settings/team-tab";
import { BillingTab } from "@/components/settings/billing-tab";
import { cn } from "@/lib/utils";
import { AppPageHeader, ListGroup, ListRow, MobileHeader, MobileStackLayout } from "@/design-system";
import { useIsMobileLayout } from "@/hooks/use-media-query";
import { Loader2, Mail, Palette, Plug, Save, Sparkles, Users, Wrench, CreditCard } from "lucide-react";
import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { clampScoutCompaniesLimit, clampScoutLeadsLimit } from "@/lib/enrichment/config";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import { toast } from "sonner";

const ALL_NAV_ITEMS: SettingsNavItem[] = [
  { value: "enrichment", label: "Enrichment", icon: Wrench },
  { value: "email", label: "Email", icon: Mail },
  { value: "billing", label: "Credits", icon: CreditCard },
  { value: "team", label: "Team", icon: Users },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "ai-usage", label: "Platform Keys", icon: Sparkles },
  { value: "appearance", label: "Appearance", icon: Palette },
];

const TAB_SUBTITLES: Record<string, string> = {
  enrichment: "Providers, geography, and scout volume",
  email: "Sending, connection, and sequence",
  billing: "Balance and top-ups",
  team: "Members and invites",
  integrations: "LinkedIn and WhatsApp",
  "ai-usage": "Search and LLM keys",
  appearance: "Theme",
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

  const NAV_ITEMS = useMemo(
    () =>
      ALL_NAV_ITEMS.filter((item) => {
        if (item.value === "ai-usage") return session?.isSuperadmin === true;
        if (item.value === "team") return session?.canManageTeam === true;
        if (item.value === "email" || item.value === "enrichment") {
          return session?.role === "owner" || session?.role === "admin" || session?.isSuperadmin === true;
        }
        return true;
      }),
    [session],
  );
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "enrichment");
  const [config, setConfig] = useState<EnrichmentConfig | null>(null);
  const [prospeoConfigured, setProspeoConfigured] = useState(false);
  const [zintlrConfigured, setZintlrConfigured] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [smtpPassDraft, setSmtpPassDraft] = useState("");
  const [resendApiKeyDraft, setResendApiKeyDraft] = useState("");
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const hasUnsavedRef = useRef(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (!session) return;
    if (!NAV_ITEMS.some((item) => item.value === activeTab) && NAV_ITEMS[0]) {
      setActiveTab(NAV_ITEMS[0].value);
    }
  }, [activeTab, session, NAV_ITEMS]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const {
          prospeoConfigured: prospeoReady,
          zintlrConfigured: zintlrReady,
          ...rest
        } = data as EnrichmentConfig & {
          prospeoConfigured?: boolean;
          zintlrConfigured?: boolean;
        };
        setProspeoConfigured(Boolean(prospeoReady));
        setZintlrConfigured(Boolean(zintlrReady));
        setConfig(rest);
      });
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
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            scoutCompaniesLimit: clampScoutCompaniesLimit(partial.scoutCompaniesLimit),
            scoutLeadsLimit: clampScoutLeadsLimit(partial.scoutLeadsLimit),
          }
        : prev,
    );
    setDirty(true);
  }

  const hasUnsaved =
    dirty || emailDirty || Boolean(smtpPassDraft.trim()) || Boolean(resendApiKeyDraft.trim());

  useEffect(() => {
    hasUnsavedRef.current = hasUnsaved;
  }, [hasUnsaved]);

  function hrefLeavingSettings(raw: string): string | null {
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return null;
    try {
      const url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) return null;
      if (url.pathname === "/settings" || url.pathname.startsWith("/settings/")) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  function askLeave(href: string) {
    pendingHrefRef.current = href;
    setLeaveOpen(true);
  }

  function stayOnSettings() {
    pendingHrefRef.current = null;
    setLeaveOpen(false);
  }

  function discardAndLeave() {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setLeaveOpen(false);
    setDirty(false);
    setEmailDirty(false);
    setSmtpPassDraft("");
    setResendApiKeyDraft("");
    if (href) router.push(href);
  }

  async function save(): Promise<boolean> {
    if (!config) return false;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        toast.error("Save failed");
        return false;
      }
      setDirty(false);
      window.dispatchEvent(
        new CustomEvent("scout-volume-updated", {
          detail: {
            scoutCompaniesLimit: config.scoutCompaniesLimit,
            scoutLeadsLimit: config.scoutLeadsLimit,
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("scout-geo-updated", {
          detail: {
            scoutGeo: config.scoutGeo,
            scoutAreaOfFocus: config.scoutAreaOfFocus ?? null,
            scoutAreasOfFocus: config.scoutAreasOfFocus ?? [],
          },
        }),
      );
      toast.success("Settings saved — applies to next Scout run");
      return true;
    } catch {
      toast.error("Save failed");
      return false;
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

  async function saveEmail(): Promise<boolean> {
    if (!emailConfig) return false;
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
        return false;
      }
      if (data.config) setEmailConfig(data.config);
      setSmtpPassDraft("");
      setEmailDirty(false);
      toast.success("Email settings saved");
      return true;
    } catch {
      toast.error("Could not save email settings");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndLeave() {
    const emailNeedsSave = emailDirty || Boolean(smtpPassDraft.trim()) || Boolean(resendApiKeyDraft.trim());
    if (dirty) {
      const ok = await save();
      if (!ok) return;
    }
    if (emailNeedsSave) {
      const ok = await saveEmail();
      if (!ok) return;
    }
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setLeaveOpen(false);
    if (href) router.push(href);
  }

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!hasUnsavedRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = hrefLeavingSettings(anchor.getAttribute("href") ?? "");
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      askLeave(href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

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
          "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-[var(--shadow-brand-sm)] transition-all lg:px-4 lg:py-2",
          (activeTab === "email" ? (emailDirty || smtpPassDraft.trim() || resendApiKeyDraft.trim()) && emailConfig : dirty && config) && !saving
            ? "bg-brand-black text-white hover:opacity-90"
            : "cursor-not-allowed bg-white/60 text-brand-ink-faint opacity-60",
        )}
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        <span className="hidden sm:inline">{saving ? "Saving…" : "Save"}</span>
      </button>
    ) : null;

  const settingsList = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-brand-canvas lg:hidden">
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
        {(() => {
          const item = NAV_ITEMS.find((i) => i.value === activeTab);
          const Icon = (item?.icon ?? Wrench) as typeof Wrench;
          return (
            <AppPageHeader
              icon={Icon}
              title={item?.label ?? "Settings"}
              subtitle={TAB_SUBTITLES[activeTab]}
              actions={saveAction}
            />
          );
        })()}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-10 lg:px-6 lg:py-6">
          <div className="mx-auto w-full max-w-2xl">
          <div key={activeTab} className="animate-brand-tab-in">
          {activeTab === "enrichment" && (
            <EnrichmentTab
              config={config}
              prospeoConfigured={prospeoConfigured}
              zintlrConfigured={zintlrConfigured}
              onUpdate={update}
              onUpdateScoutVolume={updateScoutVolume}
            />
          )}

          {activeTab === "email" && (
            <EmailTab config={emailConfig} onUpdate={updateEmail} smtpPassDraft={smtpPassDraft} onSmtpPassChange={handleSmtpPassChange} resendApiKeyDraft={resendApiKeyDraft} onResendApiKeyChange={handleResendApiKeyChange} onVerify={verifyEmail} verifying={verifyingEmail} />
          )}

          {activeTab === "billing" && <BillingTab />}
          {activeTab === "team" && <TeamTab />}

          {activeTab === "integrations" && (
            <Suspense fallback={<div className="py-12 text-center text-brand-ink-faint">Loading…</div>}>
              <WhatsAppIntegration />
              <LinkedInIntegration />
            </Suspense>
          )}

          {activeTab === "ai-usage" && <AiUsageTab />}

          {activeTab === "appearance" && <AppearanceTab />}
          </div>
          </div>
        </div>
        <SettingsStickySaveBar
          visible={activeTab === "enrichment" && dirty && Boolean(config)}
          saving={saving}
          disabled={!dirty || saving || !config}
          onSave={() => void save()}
        />
      </div>
  );

  const unsavedModal = (
    <UnsavedChangesModal
      open={leaveOpen}
      saving={saving}
      onStay={stayOnSettings}
      onDiscard={discardAndLeave}
      onSave={() => void saveAndLeave()}
    />
  );

  return isMobileLayout ? (
    <>
      <MobileStackLayout
        showDetail={mobileShowDetail}
        list={settingsList}
        detail={settingsDetail}
      />
      {unsavedModal}
    </>
  ) : (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <SettingsNav value={activeTab} onChange={handleTabChange} items={NAV_ITEMS} />
      {settingsDetail}
      {unsavedModal}
    </div>
  );
}

export function SettingsApp() {
  return (
    <Suspense fallback={<div className="min-w-0 flex-1 p-8 text-brand-ink-faint">Loading settings…</div>}>
      <SettingsAppInner />
    </Suspense>
  );
}
