"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button, Separator, text } from "@/design-system";
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
    <div className="h-screen overflow-hidden bg-white p-[15px] font-sans">
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
          <main className="flex min-h-0 flex-1 flex-col">
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
      </div>
    </div>
  );
}
