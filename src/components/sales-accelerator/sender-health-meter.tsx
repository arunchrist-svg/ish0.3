"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/design-system";
import { fetchSenderHealth, type SenderHealthResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

type Props = { className?: string };

function worstSeverity(health: SenderHealthResponse | null) {
  if (!health) return "unknown";
  if (health.domainAuth.status === "unsupported" || health.issues.some((i) => i.severity === "critical")) {
    return "critical";
  }
  if (health.domainAuth.status === "partial" || health.issues.some((i) => i.severity === "warn")) {
    return "warn";
  }
  return "ok";
}

function pillLabel(health: SenderHealthResponse | null, severity: string) {
  if (!health) return "Sender · …";
  if (health.domainAuth.status === "unsupported") return "Personal inbox";
  if (severity === "ok") return "Sender OK";
  if (severity === "warn") return "Sender · Review";
  return "Sender · Blocked";
}

export function SenderHealthMeter({ className }: Props) {
  const [health, setHealth] = useState<SenderHealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSenderHealth()
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const severity = worstSeverity(health);
  const Icon = severity === "ok" ? ShieldCheck : severity === "warn" ? Shield : ShieldAlert;
  const label = pillLabel(health, severity);

  const color =
    severity === "ok"
      ? "text-ish-stratus-blue"
      : severity === "warn"
        ? "text-ish-stratus-yellow"
        : severity === "critical"
          ? "text-ish-stratus-salmon"
          : "text-ish-ink-faint";

  const auth = health?.domainAuth;

  return (
    <Tooltip>
      <TooltipTrigger>
        <div
          className={cn(
            "inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-ish-stratus-blue/30 bg-white/90 px-2.5 py-1 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm transition-colors hover:border-ish-stratus-blue/45",
            className,
          )}
        >
          <Icon className={cn("size-3.5", color)} />
          <span className={cn("whitespace-nowrap text-[11px] font-bold", color)}>{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="flex max-w-[260px] flex-col items-start gap-1 rounded-xl border border-ish-stratus-blue/25 bg-white/95 px-3 py-2.5 text-[11px] leading-relaxed text-ish-ink shadow-[var(--shadow-ish)] backdrop-blur-md [&_[class*='rotate-45']]:border-ish-stratus-blue/25 [&_[class*='rotate-45']]:bg-white [&_[class*='rotate-45']]:fill-white"
      >
        <p className="font-semibold text-ish-ink">Sender authentication</p>
        {health && auth ? (
          <>
            <p className="text-ish-ink-soft">{auth.label}</p>
            {auth.status !== "unsupported" ? (
              <p className="text-ish-ink-soft">
                SPF {auth.checks.spf.valid ? "✓" : "✗"} · DMARC {auth.checks.dmarc.valid ? "✓" : "✗"}
                {auth.checks.dmarc.policy ? ` (p=${auth.checks.dmarc.policy})` : ""} · DKIM{" "}
                {auth.checks.dkim.valid ? `✓ (${auth.checks.dkim.selector})` : "?"}
              </p>
            ) : null}
            <p className="text-ish-ink-soft">
              Sends last 24h: {health.sendsLast24h}/{health.dailyCap}
            </p>
            {health.issues.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ish-ink-soft">
                {health.issues.map((i) => (
                  <li key={i.id}>{i.label}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-ish-ink-soft">Could not load sender health.</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
