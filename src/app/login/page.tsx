"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="flex min-h-screen items-center justify-center bg-ish-app">
      <div className="w-full max-w-sm rounded-[24px] bg-white p-10 shadow-[0_8px_40px_rgba(20,16,30,0.12)]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-ish-yellow text-3xl shadow-[0_4px_14px_rgba(244,242,90,0.4)]">
            🍬
          </div>
          <h1 className="text-[22px] font-bold text-ish-ink">ISH Sales Accelerator</h1>
          <p className="mt-1 text-[13px] text-ish-ink-soft">Enter your access PIN to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            maxLength={8}
            className="w-full rounded-[14px] border border-ish-border bg-ish-app px-4 py-3 text-center text-xl font-bold tracking-widest text-ish-ink outline-none focus:border-ish-ink focus:ring-0"
          />
          {error && (
            <p className="text-center text-[12px] font-medium text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full rounded-[14px] bg-ish-black py-3 text-[14px] font-bold text-white transition-opacity disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
