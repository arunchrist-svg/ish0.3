"use client";

import { useState } from "react";
import { Globe } from "lucide-react";

export type MissingWebsiteCompany = {
  id: string;
  name: string;
};

type Props = {
  companies: MissingWebsiteCompany[];
  applyingId?: string | null;
  onApply: (companyId: string, website: string) => void | Promise<void>;
};

export function MissingWebsitePrompt({ companies, applyingId, onApply }: Props) {
  if (!companies.length) return null;

  return (
    <div className="mx-auto mt-6 w-full max-w-md text-left">
      <p className="mb-3 text-[12px] font-semibold text-brand-ink">
        Paste the official website for {companies.length === 1 ? "this company" : "these companies"}
      </p>
      <div className="space-y-3">
        {companies.map((company) => (
          <WebsitePasteRow
            key={company.id}
            company={company}
            applying={applyingId === company.id}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
}

function WebsitePasteRow({
  company,
  applying,
  onApply,
}: {
  company: MissingWebsiteCompany;
  applying: boolean;
  onApply: (companyId: string, website: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className="rounded-xl border border-brand-border/80 bg-brand-app/60 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onApply(company.id, value);
      }}
    >
      <label className="mb-1.5 block text-[12px] font-semibold leading-snug text-brand-ink">
        {company.name}
      </label>
      <div className="flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://company.com"
            autoComplete="url"
            inputMode="url"
            disabled={applying}
            className="h-9 w-full rounded-lg border border-brand-border bg-white pl-8 pr-2.5 text-[12px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-ink/40"
          />
        </div>
        <button
          type="submit"
          disabled={applying || !value.trim()}
          className="h-9 shrink-0 rounded-lg bg-brand-ink px-3 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {applying ? "Fetching…" : "Save and fetch"}
        </button>
      </div>
    </form>
  );
}
