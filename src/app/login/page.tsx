"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, text } from "@/design-system";
import { AuthField } from "@/components/auth/auth-field";
import { AuthShell } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

type OrgOption = { slug: string; name: string };

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slug, setSlug] = useState("");
  const [slugRequired, setSlugRequired] = useState(false);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const inviteRequired = errorCode === "invite_required";

  useEffect(() => {
    if (!email.includes("@")) return;
    const t = setTimeout(() => {
      fetch(`/api/auth/account-type?email=${encodeURIComponent(email.trim())}`)
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

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, slug: slugRequired ? slug : undefined }),
    });

    const data = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
      slugs?: OrgOption[];
      redirect?: string;
    } | null;

    if (res.ok) {
      router.push(data?.redirect ?? "/");
    } else if (data?.code === "WORKSPACE_AMBIGUOUS" && data.slugs) {
      setSlugRequired(true);
      setOrgOptions(data.slugs);
      setError("Select your organization to continue.");
    } else {
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
        {slugRequired ? (
          orgOptions.length > 0 ? (
            <div>
              <label htmlFor="slug" className="mb-1.5 block text-[12px] font-semibold text-ish-ink">Organization</label>
              <select
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                className="w-full rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] outline-none focus:border-ish-stratus-blue/50 focus:ring-2 focus:ring-ish-stratus-blue/20"
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
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-[13px] font-medium text-red-600">{error}</p>
        ) : null}

        <Button
          type="submit"
          disabled={loading || !email || password.length < 8 || (slugRequired && !slug)}
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
