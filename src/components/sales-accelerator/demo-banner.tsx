"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  const [show, setShow] = useState(false);
  const [sendMode, setSendMode] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const demo = data.tenant?.demoMode || data.sendMode === "dry_run";
        setShow(demo);
        setSendMode(data.sendMode ?? "dry_run");
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] font-medium text-amber-900">
      <FlaskConical className="size-4 shrink-0" />
      <span>
        Demo mode — emails are logged only ({sendMode}). Scout, enrich, and draft work without sending live outreach.
      </span>
    </div>
  );
}
