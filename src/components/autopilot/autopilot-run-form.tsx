"use client";

import { useState } from "react";
import { SCOUT_INDUSTRIES } from "@/lib/scouting-data";
import { cn } from "@/lib/utils";
import type { AutopilotRunDto } from "@/lib/api-client";

export type AutopilotRunFormValues = {
  cities: string[];
  industries: string[];
};

export function AutopilotRunForm({
  title,
  submitLabel,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: AutopilotRunDto["input"] | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (values: AutopilotRunFormValues) => Promise<void>;
}) {
  const [cityText, setCityText] = useState((initial?.cities ?? []).join(", "));
  const [industries, setIndustries] = useState<string[]>(initial?.industries ?? []);
  const [error, setError] = useState<string | null>(null);

  function toggleIndustry(name: string) {
    setIndustries((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-brand-border bg-white p-4 shadow-[var(--shadow-brand-sm)]"
      onSubmit={async (event) => {
        event.preventDefault();
        const cities = cityText.split(/[,/]/).map((city) => city.trim()).filter(Boolean);
        if (!cities.length) {
          setError("Add at least one city.");
          return;
        }
        setError(null);
        await onSubmit({ cities, industries });
      }}
    >
      <p className="text-[13px] font-semibold text-brand-ink">{title}</p>
      <label className="block">
        <span className="text-[11px] font-semibold text-brand-ink-soft">Cities</span>
        <input
          value={cityText}
          onChange={(event) => setCityText(event.target.value)}
          placeholder="Hosur, Bengaluru"
          className="mt-1 h-9 w-full rounded-xl border border-brand-border px-3 text-[13px] text-brand-ink outline-none focus:border-brand-ink/40"
        />
      </label>
      <div>
        <p className="text-[11px] font-semibold text-brand-ink-soft">Industries</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SCOUT_INDUSTRIES.map((name) => {
            const on = industries.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleIndustry(name)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  on ? "bg-brand-black text-white" : "border border-brand-border text-brand-ink-soft",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      {error ? <p className="text-[12px] text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-8 items-center rounded-full bg-brand-black px-3 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-full border border-brand-border px-3 text-[12px] font-semibold text-brand-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
