"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button, text } from "@/design-system";
import { AuthField } from "@/components/auth/auth-field";
import { AuthShell } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

type InviteInfo = { email: string; tenantName: string; role: string };

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    setLoadingInvite(true);
    fetch(`/api/auth/invite/${inviteToken}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setInviteError(data.error);
        else setInvite(data);
      })
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite || !inviteToken) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: invite.email, password, inviteToken }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (res.ok) {
      router.push(data.redirect ?? "/");
    } else {
      setError(data.error ?? "Signup failed");
    }
  }

  if (!inviteToken) {
    return (
      <AuthShell>
        <div className="mb-8">
          <h1 className={cn("mb-2 leading-tight", text.display)}>Sign up</h1>
          <p className="text-[14px] text-ish-ink-soft">
            You need an invite link from your admin to create an account.
          </p>
        </div>
        <p className="text-center text-[13px] text-ish-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ish-black underline">
            Sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (loadingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-ish-ink-soft" />
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <AuthShell>
        <p className="text-center text-[14px] text-red-600">
          {inviteError || "Invite link is invalid or expired."}
        </p>
        <p className="mt-4 text-center text-[13px] text-ish-ink-soft">
          <Link href="/login" className="underline">Sign in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className={cn("mb-2 leading-tight", text.display)}>Sign up</h1>
        <p className="text-[14px] text-ish-ink-soft">
          Join <strong>{invite.tenantName}</strong> as {invite.email}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          id="name"
          label="Your name"
          value={name}
          onChange={setName}
          placeholder="Your name"
          required
        />
        <div>
          <label htmlFor="email" className="mb-2.5 block text-[13px] font-semibold text-ish-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={invite.email}
            disabled
            className="w-full rounded-2xl border border-ish-border bg-ish-app px-5 py-4 text-[15px] font-medium text-ish-ink-soft"
          />
        </div>
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="8+ characters"
          required
          minLength={8}
        />

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-[13px] font-medium text-red-600">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={loading || !name || password.length < 8}
          className={cn(
            "h-12 w-full rounded-2xl bg-ish-black text-[14px] font-bold text-white",
            "hover:bg-ish-black/90 disabled:opacity-50",
          )}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Signing up…
            </span>
          ) : (
            "Sign up"
          )}
        </Button>

        <p className="text-center text-[12px] text-ish-ink-faint">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-ish-black underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-ish-ink-soft" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
