"use client";

import Link from "next/link";
import { Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentRunItem = {
  id: string;
  agent: string;
  leadId: string | null;
  leadName: string | null;
  status: string;
  error: string | null;
  completedAt?: string | null;
};

type AgentStatusBarProps = {
  runs: AgentRunItem[];
  className?: string;
};

function labelForAgent(agent: string): string {
  if (agent === "researcher-lite") return "Research";
  if (agent === "writer") return "Writer";
  if (agent === "scout") return "Scout";
  if (agent === "gift-intel") return "Gift Intel";
  if (agent === "sequencer") return "Sequencer";
  return agent;
}

export function AgentStatusBar({ runs, className }: AgentStatusBarProps) {
  const visible = runs.filter((r) => r.status === "running" || (r.status === "completed" && Date.now() - new Date(r.completedAt ?? 0).getTime() < 120_000));
  if (!visible.length) return null;

  const running = visible.filter((r) => r.status === "running");

  return (
    <div className={cn("ish-agent-status-bar shrink-0 border-b border-ish-border/50 bg-white/90 px-4 py-2 backdrop-blur-md lg:px-6", className)}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <Sparkles className="size-4 shrink-0 text-ish-stratus-blue" />
        {running.length > 0 ? (
          <span className="shrink-0 text-[11px] font-semibold text-ish-ink-soft">
            {running.length} agent{running.length === 1 ? "" : "s"} running
          </span>
        ) : (
          <span className="shrink-0 text-[11px] font-semibold text-ish-green">Agents finished</span>
        )}
        {visible.slice(0, 4).map((run) => {
          const href = run.leadId ? `/leads?lead=${run.leadId}` : undefined;
          const inner = (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                run.status === "running" ? "bg-ish-yellow-soft text-ish-ink" : run.status === "failed" ? "bg-ish-pink-soft text-ish-ink" : "bg-ish-green-soft text-ish-ink",
              )}
            >
              {run.status === "running" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : run.status === "failed" ? (
                <AlertCircle className="size-3" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {labelForAgent(run.agent)}
              {run.leadName ? ` · ${run.leadName}` : ""}
            </span>
          );
          return href ? (
            <Link key={run.id} href={href} className="shrink-0 active:scale-95">
              {inner}
            </Link>
          ) : (
            <span key={run.id}>{inner}</span>
          );
        })}
      </div>
    </div>
  );
}
