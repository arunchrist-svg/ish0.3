"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Shield, Loader2, Coins } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";
import { AppPageHeader, ListGroup, ListRow, MobilePageLayout } from "@/design-system";

export default function ProfilePage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setUserName(data.user.name);
          setUserEmail(data.user.email);
        }
        if (data.tenant) setOrgName(data.tenant.name);
        if (typeof data.role === "string") setRole(data.role);
        if (typeof data.credits === "number") setCredits(data.credits);
        if (data.isSuperadmin) setIsSuperadmin(true);
      });
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <MobilePageLayout
      title="Profile"
      subtitle={orgName || "Your account"}
      largeTitle
      className="lg:bg-transparent"
      contentClassName="flex flex-col !overflow-hidden"
    >
      <AppPageHeader
        icon={User}
        title="Profile"
        subtitle="Account, session, and access information"
      />
      <div className="settings-ambient mx-auto w-full max-w-2xl flex-1 overflow-y-auto ish-page-padding py-6 lg:px-6 lg:py-6 animate-brand-page-in">
        <SettingsGroup title="Identity">
          <SettingsRow className="gap-4 !py-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow-soft shadow-[var(--shadow-brand-sm)]">
              <User className="size-7 text-brand-ink" />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-brand-ink">{userName || "Account"}</p>
              <p className="text-[13px] text-brand-ink-soft">{orgName || "Your organization"} · Sales Hub</p>
              {userEmail ? <p className="mt-0.5 text-[12px] text-brand-ink-faint">{userEmail}</p> : null}
              {isSuperadmin ? (
                <a href="/admin" className="mt-2 inline-block text-[12px] font-semibold text-brand-stratus-blue hover:underline">
                  Platform Admin →
                </a>
              ) : null}
            </div>
          </SettingsRow>
          {credits !== null && (
            <>
              <SettingsGroupDivider />
              <SettingsRow className="justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="size-4 text-brand-stratus-yellow" />
                  <span className="text-[13px] text-brand-ink-soft">Credits remaining</span>
                </div>
                <a href="/settings?tab=billing" className="text-[14px] font-semibold text-brand-ink hover:underline">
                  {credits.toLocaleString()} →
                </a>
              </SettingsRow>
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title="Session">
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-brand-ink-soft">Auth method</span>
            <span className="text-[13px] font-medium text-brand-ink">PIN</span>
          </SettingsRow>
          <SettingsGroupDivider />
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-brand-ink-soft">Session duration</span>
            <span className="text-[13px] font-medium text-brand-ink">7 days</span>
          </SettingsRow>
          <SettingsGroupDivider />
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-brand-ink-soft">Status</span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink">
              <span className="size-1.5 rounded-full bg-brand-stratus-blue shadow-[0_0_6px_rgba(131,162,219,0.6)]" />
              Active
            </span>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Access">
          <SettingsRow className="justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-brand-stratus-blue" />
              <span className="text-[13px] text-brand-ink-soft">Role</span>
            </div>
            <span className="rounded-full bg-brand-black px-2.5 py-0.5 text-[11px] font-semibold capitalize text-white shadow-[var(--shadow-brand-sm)]">
              {role || "Member"}
            </span>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Sign Out" footer="You will be taken back to the login screen.">
          <div className="px-4 py-4">
            <p className="mb-4 text-[13px] text-brand-ink-soft">
              Your session PIN will be required to sign back in.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-all",
                loggingOut ? "cursor-not-allowed bg-brand-stratus-salmon/60" : "bg-brand-stratus-salmon hover:opacity-90",
              )}
            >
              {loggingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </SettingsGroup>
      </div>
    </MobilePageLayout>
  );
}
