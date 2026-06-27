"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, text } from "@/design-system";
import { AuthField } from "@/components/auth/auth-field";
import { AuthShell } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requireCurrent, setRequireCurrent] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.mustChangePassword) setRequireCurrent(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPassword,
        ...(requireCurrent ? { currentPassword } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      router.push(data.redirect ?? "/");
    } else {
      setError(data.error ?? "Failed to change password");
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className={cn("mb-2 leading-tight", text.display)}>Change password</h1>
        <p className="text-[14px] text-ish-ink-soft">Set a new password for your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {requireCurrent ? (
          <AuthField
            id="currentPassword"
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
        ) : null}
        <AuthField
          id="newPassword"
          label="New password"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          required
          minLength={8}
        />
        <AuthField
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          minLength={8}
        />

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-[13px] font-medium text-red-600">{error}</p>
        ) : null}

        <Button type="submit" disabled={loading || newPassword.length < 8} className="h-12 w-full rounded-2xl bg-ish-black text-[14px] font-bold text-white">
          {loading ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
