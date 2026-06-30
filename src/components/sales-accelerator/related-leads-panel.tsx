"use client";

import { useEffect, useState } from "react";
import { Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RelatedItem = {
  person: { name: string; title?: string; matchScore?: number; email?: string };
  reason: string;
  score: number;
};

export function RelatedLeadsPanel({ leadId }: { leadId: string }) {
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leads/${leadId}/related`)
      .then((r) => (r.ok ? r.json() : { related: [] }))
      .then((data) => setRelated(data.related ?? []))
      .catch(() => setRelated([]))
      .finally(() => setLoading(false));
  }, [leadId]);

  if (loading) {
    return <div className="px-6 py-12 text-center text-[13px] text-ish-ink-soft">Loading related leads…</div>;
  }

  if (!related.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Users className="size-8 text-ish-ink-faint" />
        <p className="text-[13px] text-ish-ink-soft">No related leads yet. Scout more contacts at this company or in this industry.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h3 className="mb-4 text-[14px] font-bold text-ish-ink">People you may also want to reach</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {related.map((item, i) => (
          <div key={i} className="rounded-2xl border border-ish-border bg-white p-4 shadow-[var(--shadow-ish-sm)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-bold text-ish-ink">{item.person.name}</div>
                <div className="text-[11px] text-ish-ink-soft">{item.person.title ?? "—"}</div>
              </div>
              <span className="rounded-full bg-ish-yellow/40 px-2 py-0.5 text-[10px] font-bold text-ish-ink">
                {item.person.matchScore ?? item.score}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-ish-ink-soft">
              <Building2 className="size-3" />
              {item.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
