"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSenderHealth, type SenderHealthResponse } from "@/lib/api-client";
import { SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

export function SenderHealthSettings() {
  const [health, setHealth] = useState<SenderHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(refresh ? "/api/email/sender-health?refresh=1" : "/api/email/sender-health");
      if (!res.ok) throw new Error("Failed");
      setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const auth = health?.domainAuth;

  return (
    <SettingsRow className="flex-col items-stretch gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-ish-ink">Sender authentication</p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ish-ink-soft hover:text-ish-ink disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>
      {loading && !health ? (
        <p className="text-[11px] text-ish-ink-faint">Checking DNS…</p>
      ) : health && auth ? (
        <>
          <p className="text-[11px] text-ish-ink-soft">{auth.label}</p>
          {auth.status !== "unsupported" ? (
            <p className="text-[11px] text-ish-ink">
              SPF {auth.checks.spf.valid ? "✓" : "✗"} · DMARC {auth.checks.dmarc.valid ? "✓" : "✗"}
              {auth.checks.dmarc.policy ? ` (p=${auth.checks.dmarc.policy})` : ""} · DKIM{" "}
              {auth.checks.dkim.valid ? "✓" : "?"}
            </p>
          ) : null}
          <p className="text-[11px] text-ish-ink-soft">
            Sends last 24h: {health.sendsLast24h} / cap {health.dailyCap}
          </p>
          {health.personalInboxSender ? (
            <p className="text-[11px] font-medium text-[#e8a000]">
              Personal inbox sender — use a company domain for production outreach.
            </p>
          ) : null}
          {health.issues.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-ish-ink-soft">
              {health.issues.map((i) => (
                <li key={i.id}>{i.label}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-ish-green">No sender issues detected.</p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-ish-ink-faint">Could not load sender health.</p>
      )}
    </SettingsRow>
  );
}
