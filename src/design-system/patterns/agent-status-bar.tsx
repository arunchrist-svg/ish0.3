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
  if (agent === "writer") return "Smart emails";
  if (agent === "scout") return "Scout";
  if (agent === "gift-intel" || agent === "brand-intel") return "Brand Intelligence";
  if (agent === "occasion-intel") return "Occasion Intel";
  if (agent === "sequencer") return "Sequencer";
  if (agent === "reply-writer" || agent === "reply-planner" || agent === "reply-orchestrator") return "Reply Writer";
  return agent;
}

export function AgentStatusBar({ runs, className }: AgentStatusBarProps) {
  const visible = runs.filter((r) => r.status === "running" || (r.status === "completed" && Date.now() - new Date(r.completedAt ?? 0).getTime() < 120_000));
  if (!visible.length) return null;

  const running = visible.filter((r) => r.status === "running");

  return (
    <div className={cn(
      "ish-agent-status-bar shrink-0 border-b border-brand-border/40 bg-white/90 px-3 py-1.5 backdrop-blur-xl lg:px-6 lg:py-2",
      "max-lg:mx-3 max-lg:mt-2 max-lg:mb-0 max-lg:rounded-2xl max-lg:border max-lg:border-brand-border/40 max-lg:shadow-[var(--shadow-brand-sm)]",
      className,
    )}>
      <div className="flex items-center gap-2 overflow-x-auto">
        <Sparkles className="size-4 shrink-0 text-brand-stratus-blue" />
        {running.length > 0 ? (
          <span className="shrink-0 text-[11px] font-semibold text-brand-ink-soft">
            {running.length} agent{running.length === 1 ? "" : "s"} running
          </span>
        ) : (
          <span className="shrink-0 text-[11px] font-semibold text-brand-green">Agents finished</span>
        )}
        {visible.slice(0, 4).map((run) => {
          const href = run.leadId ? `/leads?lead=${run.leadId}` : undefined;
          const inner = (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                run.status === "running" ? "bg-brand-yellow-soft text-brand-ink" : run.status === "failed" ? "bg-brand-pink-soft text-brand-ink" : "bg-brand-green-soft text-brand-ink",
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
