"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, text } from "@/design-system";
import { AuthField } from "@/components/auth/auth-field";
import { AuthShell } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const inviteRequired = errorCode === "invite_required";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = (await res.json()) as { redirect?: string };
      router.push(data.redirect ?? "/");
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Invalid email or password.");
    }

    setLoading(false);
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className={cn("mb-2 leading-tight", text.display)}>Welcome back</h1>
        <p className="text-[14px] text-ish-ink-soft">Sign in with your email and password.</p>
      </div>

      {inviteRequired ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-[13px] text-amber-800">
          You need an invite to join. Ask your admin for an invite link to create your account.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          required
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Your password"
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
          disabled={loading || !email || password.length < 8}
          className={cn(
            "h-12 w-full rounded-2xl bg-ish-black text-[14px] font-bold text-white",
            "hover:bg-ish-black/90 disabled:opacity-50",
          )}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </span>
          ) : (
            "Sign In"
          )}
        </Button>

        <p className="text-center text-[12px] text-ish-ink-faint">
          Need an account? Use the invite link your admin sent you.
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-ish-ink-soft" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
