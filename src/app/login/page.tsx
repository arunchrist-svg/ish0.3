"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { AuthField } from "@/components/auth/auth-field";
import { AuthShell } from "@/components/auth/auth-shell";
import { completeLoginRedirect, safeInternalNextPath } from "@/lib/auth/complete-login";

type OrgOption = { slug: string; name: string };

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [slugRequired, setSlugRequired] = useState(false);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const inviteRequired = errorCode === "invite_required";
  const nextPath = safeInternalNextPath(searchParams.get("next"));

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { authenticated?: boolean; redirect?: string } | null) => {
        if (!data?.authenticated) return;
        completeLoginRedirect(nextPath ?? data.redirect ?? "/");
      })
      .catch(() => undefined);
  }, [nextPath]);


  useEffect(() => {
    if (!email.includes("@")) return;
    const t = setTimeout(() => {
      fetch(`/api/auth/account-type?email=${encodeURIComponent(email.trim())}`, { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.slugRequired && data.slugs) {
            setSlugRequired(true);
            setOrgOptions(data.slugs);
          } else {
            setSlugRequired(false);
            setOrgOptions([]);
            if (data.slug) setSlug(data.slug);
          }
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedSlug = slug.trim();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
          slug: slugRequired ? trimmedSlug : undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        slugs?: OrgOption[];
        redirect?: string;
      } | null;

      if (res.ok) {
        const redirect = data?.redirect;
        const destination =
          redirect === "/change-password" || redirect === "/onboarding"
            ? redirect
            : redirect === "/admin"
              ? redirect
              : nextPath ?? "/";
        completeLoginRedirect(destination);
        return;
      } else if (data?.code === "WORKSPACE_AMBIGUOUS" && data.slugs) {
        setSlugRequired(true);
        setOrgOptions(data.slugs);
        setError("Select your organization to continue.");
      } else if (!data?.error && !res.ok) {
        setError("Could not reach the server. Check your connection and try again.");
      } else {
        setError(data?.error ?? "Invalid email or password.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    }

    setLoading(false);
  }

  return (
    <AuthShell>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-stratus-blue">Sign in</p>
      <h1 className="mb-4 text-[22px] font-extrabold leading-tight tracking-tight text-brand-ink">Welcome back</h1>

      {inviteRequired ? (
        <p className="mb-3 rounded-xl border border-brand-stratus-yellow/40 bg-brand-yellow-soft/80 px-3 py-2 text-center text-[12px] text-brand-ink">
          You need an invite to join. Ask your admin for an invite link.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          required
        />
        {slugRequired ? (
          orgOptions.length > 0 ? (
            <div>
              <label htmlFor="slug" className="mb-1 block text-[12px] font-semibold text-brand-ink">Organization</label>
              <select
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="w-full rounded-xl border border-brand-border/60 bg-white/80 px-3 py-2 text-[13px] outline-none focus:border-brand-stratus-blue/50 focus:ring-2 focus:ring-brand-stratus-blue/20"
              >
                <option value="">Select organization</option>
                {orgOptions.map((o) => (
                  <option key={o.slug} value={o.slug}>{o.name} ({o.slug})</option>
                ))}
              </select>
            </div>
          ) : (
            <AuthField
              id="slug"
              label="Organization slug"
              type="text"
              value={slug}
              onChange={setSlug}
              placeholder="your-company"
              required
            />
          )
        ) : null}
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
          <p className="rounded-xl border border-brand-stratus-salmon/35 bg-brand-pink-soft/80 px-3 py-2 text-center text-[12px] font-medium text-brand-stratus-salmon">{error}</p>
        ) : null}

        <Button
          type="submit"
          disabled={loading || !email.trim() || password.trim().length < 8 || (slugRequired && !slug.trim())}
          className="ish-scout-cta-blue h-10 w-full rounded-full text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
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

        <p className="text-center text-[11px] text-brand-ink-faint">
          Need an account? Use the invite from your admin.
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="ish-ambient-canvas flex min-h-dvh items-center justify-center bg-brand-canvas">
        <Loader2 className="size-8 animate-spin text-brand-stratus-blue" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
