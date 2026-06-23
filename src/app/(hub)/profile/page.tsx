"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Shield, Loader2 } from "lucide-react";
import { text } from "@/design-system";
import { cn } from "@/lib/utils";
import { ISH_LOGO_URL } from "@/lib/brand";

export default function ProfilePage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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
    <div className="min-w-0 flex-1 overflow-y-auto bg-ish-app p-8">
      <div className="mb-8">
        <h1 className={text.display}>Profile</h1>
        <p className={cn("mt-1", text.bodySoft)}>Account and session information</p>
      </div>

      <div className="max-w-lg space-y-4">
        {/* Identity card */}
        <div className="rounded-2xl border border-ish-border bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ish-app">
              <img src={ISH_LOGO_URL} alt="ISH" className="h-8 w-auto" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ish-ink">ISH Owner</p>
              <p className="text-[12px] text-ish-ink-soft">India Sweet House · Sales Hub</p>
            </div>
          </div>
        </div>

        {/* Session card */}
        <div className="rounded-2xl border border-ish-border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="size-4 text-ish-ink-soft" />
            <p className="text-[13px] font-semibold text-ish-ink">Session</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-2.5">
              <span className="text-[12px] text-ish-ink-soft">Auth method</span>
              <span className="text-[12px] font-medium text-ish-ink">PIN</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-2.5">
              <span className="text-[12px] text-ish-ink-soft">Session duration</span>
              <span className="text-[12px] font-medium text-ish-ink">7 days</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-2.5">
              <span className="text-[12px] text-ish-ink-soft">Status</span>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Access card */}
        <div className="rounded-2xl border border-ish-border bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <User className="size-4 text-ish-ink-soft" />
            <p className="text-[13px] font-semibold text-ish-ink">Access</p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-ish-app px-4 py-2.5">
            <span className="text-[12px] text-ish-ink-soft">Role</span>
            <span className="rounded-full bg-ish-black px-2.5 py-0.5 text-[11px] font-semibold text-white">
              Owner
            </span>
          </div>
        </div>

        {/* Logout */}
        <div className="rounded-2xl border border-red-100 bg-white p-5">
          <p className="mb-3 text-[13px] font-semibold text-ish-ink">Sign out</p>
          <p className="mb-4 text-[12px] text-ish-ink-soft">
            You will be taken back to the login screen. Your session PIN will be required to sign back in.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(
              "flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-[13px] font-bold text-white transition-all",
              loggingOut ? "bg-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600",
            )}
          >
            {loggingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
