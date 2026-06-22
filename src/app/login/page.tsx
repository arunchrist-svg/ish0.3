"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, Separator, text } from "@/design-system";
import { ISH_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1600&q=80";

function LoginField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={cn("mb-2 block", text.label)}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className={cn(
          "w-full rounded-full border border-transparent bg-ish-app px-5 py-3.5 text-[14px] font-medium text-ish-ink",
          "placeholder:text-ish-ink-faint focus:border-ish-black focus:bg-white focus:outline-none",
        )}
      />
    </div>
  );
}

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Incorrect PIN. Try again.");
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left — brand panel */}
      <aside className="relative hidden w-[58%] overflow-hidden lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/55 to-black/80" />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <div className="inline-flex w-fit max-w-sm items-start gap-3 rounded-full border border-white/15 bg-black/35 px-4 py-3 backdrop-blur-md">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-bold text-white">Team Access</p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/65">
                Lead scouting, enrichment, outreach &amp; D365 sync
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-ish-yellow p-2 shadow-[var(--shadow-ish-yellow-sm)]">
                <img src={ISH_LOGO_URL} alt="ISH" className="h-full w-auto object-contain" />
              </div>
              <span className="text-[22px] font-bold tracking-tight text-white">
                India Sweet House
              </span>
            </div>
            <p className="text-[11px] text-white/45">© India Sweet House {new Date().getFullYear()}</p>
          </div>
        </div>
      </aside>

      {/* Right — login form */}
      <main className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
          <div className="w-full max-w-[420px]">
            <div className="mb-10 lg:hidden">
              <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-ish-yellow p-3 shadow-[var(--shadow-ish-yellow-sm)]">
                <img src={ISH_LOGO_URL} alt="ISH" className="h-full w-auto object-contain" />
              </div>
            </div>

            <div className="mb-8">
              <p className="text-[13px] font-bold text-ish-ink">India Sweet House™</p>
              <p className="text-[12px] text-ish-ink-soft">Sales Accelerator Platform</p>
            </div>

            <h1 className={cn("mb-8 max-w-[16ch] leading-tight", text.display)}>
              Welcome, login to your account.
            </h1>

            <form onSubmit={handleSubmit} className="space-y-5">
              <LoginField
                id="pin"
                label="Access PIN:"
                type="password"
                value={pin}
                onChange={setPin}
                placeholder="Enter your PIN"
                inputMode="numeric"
                maxLength={8}
              />

              {error ? (
                <p className="text-center text-[12px] font-medium text-red-500">{error}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Button
                  type="submit"
                  disabled={loading || pin.length < 4}
                  className={cn(
                    "h-12 rounded-full bg-ish-black px-8 text-[14px] font-bold text-white",
                    "hover:bg-ish-black/90 disabled:opacity-50",
                  )}
                >
                  {loading ? "Signing in…" : "Sign In Here"}
                </Button>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-ish-ink-soft">
                  <KeyRound className="size-3.5" />
                  Contact admin for access
                </span>
              </div>
            </form>
          </div>
        </div>

        <div className="px-6 pb-8 sm:px-10 lg:px-14 xl:px-20">
          <Separator className="mb-5 bg-ish-border" />
          <p className="text-center text-[12px] text-ish-ink-faint lg:text-left">
            www.indiasweethouse.in
          </p>
        </div>
      </main>
    </div>
  );
}
