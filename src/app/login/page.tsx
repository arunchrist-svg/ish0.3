"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, text } from "@/design-system";
import { ISH_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

const HERO_IMAGE =
  "https://indiasweethouse.in/cdn/shop/files/CopyofManikya1Kg1.png?v=1729236656";

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
      <label htmlFor={id} className={cn("mb-2.5 block", text.label)}>
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
          "w-full rounded-2xl border border-ish-border bg-ish-canvas px-5 py-4 text-[15px] font-medium tracking-widest text-ish-ink",
          "placeholder:text-ish-ink-faint placeholder:tracking-normal focus:border-ish-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-ish-black/5",
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
    <div className="h-screen overflow-hidden bg-black p-[15px] font-sans">
      <div className="mx-auto flex h-full max-w-[1620px] overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-ish-float)]">
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Left — product image */}
          <aside className="relative hidden w-[48%] overflow-hidden lg:block">
            <img
              src={HERO_IMAGE}
              alt="Manikya — India Sweet House"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </aside>

          {/* Right — login form */}
          <main className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex flex-1 items-center justify-center px-8 py-12 sm:px-12 lg:px-16 xl:px-20">
              <div className="w-full max-w-[400px]">
                {/* Brand */}
                <div className="mb-10">
                  <img src={ISH_LOGO_URL} alt="India Sweet House" className="h-10 w-auto object-contain" />
                </div>

                {/* Heading */}
                <div className="mb-8">
                  <h1 className={cn("mb-2 leading-tight", text.display)}>Welcome back</h1>
                  <p className="text-[14px] text-ish-ink-soft">
                    Sign in with your access PIN to continue.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  <LoginField
                    id="pin"
                    label="Access PIN"
                    type="password"
                    value={pin}
                    onChange={setPin}
                    placeholder="Enter your PIN"
                    inputMode="numeric"
                    maxLength={8}
                  />

                  {error ? (
                    <p className="rounded-xl bg-red-50 px-4 py-2.5 text-center text-[13px] font-medium text-red-600">
                      {error}
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={loading || pin.length < 4}
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

                  <p className="flex items-center justify-center gap-1.5 text-[12px] text-ish-ink-faint">
                    <KeyRound className="size-3.5" />
                    Contact admin for access
                  </p>
                </form>
              </div>
            </div>

            <div className="px-8 pb-8 sm:px-12 lg:px-16 xl:px-20">
              <p className="text-center text-[11px] text-ish-ink-faint">
                www.indiasweethouse.in
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
