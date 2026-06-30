"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Shield, Loader2, Coins } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsHero } from "@/components/settings/settings-hero";
import { cn } from "@/lib/utils";
import { ListGroup, ListRow, MobilePageLayout } from "@/design-system";
import { ISH_LOGO_URL } from "@/lib/brand";

export default function ProfilePage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [orgName, setOrgName] = useState("");
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
    >
      <div className="settings-ambient mx-auto w-full max-w-2xl ish-page-padding py-6 lg:px-6 lg:py-8 animate-ish-page-in">
        <div className="hidden lg:block">
          <SettingsHero
            icon={User}
            title="Profile"
            subtitle="Account, session, and access information"
          />
        </div>

        <SettingsGroup title="Identity">
          <SettingsRow className="gap-4 !py-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ish-yellow-soft shadow-[var(--shadow-ish-sm)]">
              <img src={ISH_LOGO_URL} alt="ISH" className="h-8 w-auto" />
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-ish-ink">{userName || "Account"}</p>
              <p className="text-[13px] text-ish-ink-soft">{orgName || "Your organization"} · Sales Hub</p>
              {userEmail ? <p className="mt-0.5 text-[12px] text-ish-ink-faint">{userEmail}</p> : null}
              {isSuperadmin ? (
                <a href="/admin" className="mt-2 inline-block text-[12px] font-semibold text-ish-stratus-blue hover:underline">
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
                  <Coins className="size-4 text-ish-stratus-yellow" />
                  <span className="text-[13px] text-ish-ink-soft">Credits remaining</span>
                </div>
                <span className="text-[14px] font-semibold text-ish-ink">{credits.toLocaleString()}</span>
              </SettingsRow>
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title="Session">
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-ish-ink-soft">Auth method</span>
            <span className="text-[13px] font-medium text-ish-ink">PIN</span>
          </SettingsRow>
          <SettingsGroupDivider />
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-ish-ink-soft">Session duration</span>
            <span className="text-[13px] font-medium text-ish-ink">7 days</span>
          </SettingsRow>
          <SettingsGroupDivider />
          <SettingsRow className="justify-between">
            <span className="text-[13px] text-ish-ink-soft">Status</span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ish-ink">
              <span className="size-1.5 rounded-full bg-ish-stratus-blue shadow-[0_0_6px_rgba(131,162,219,0.6)]" />
              Active
            </span>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Access">
          <SettingsRow className="justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-ish-stratus-blue" />
              <span className="text-[13px] text-ish-ink-soft">Role</span>
            </div>
            <span className="rounded-full bg-ish-black px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-[var(--shadow-ish-sm)]">
              Owner
            </span>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Sign Out" footer="You will be taken back to the login screen.">
          <div className="px-4 py-4">
            <p className="mb-4 text-[13px] text-ish-ink-soft">
              Your session PIN will be required to sign back in.
            </p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-all",
                loggingOut ? "cursor-not-allowed bg-ish-stratus-salmon/60" : "bg-ish-stratus-salmon hover:opacity-90",
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
