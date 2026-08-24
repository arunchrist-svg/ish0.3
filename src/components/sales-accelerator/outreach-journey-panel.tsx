"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Ban, Check, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BarNode, EmailThread } from "@/lib/api-client";

type Props = {
  thread?: EmailThread;
  processActions?: ReactNode;
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
};

/** Compact Email 1–3 progress strip. Conversation bodies live in ConversationTimeline. */
function ProgressStrip({
  nodes,
  selectedNodeId,
  onNodeSelect,
}: {
  nodes: BarNode[];
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
}) {
  function countdownToLabel(at?: string): string | null {
    if (!at) return null;
    const diff = new Date(at).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    return `${days}D`;
  }

  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      {nodes.map((node, i) => {
        const selected = selectedNodeId === node.id;
        const isDone = node.state === "done";
        const opened = Boolean(node.openedAt);
        const bounced = Boolean(node.bouncedAt);
        const countdown = node.state === "scheduled" ? countdownToLabel(node.at) : null;
        const paused = node.state === "paused";
        const displayLabel = paused
          ? `${node.label} (paused)`
          : countdown
            ? `${node.label} (${countdown})`
            : node.label;

        return (
          <div key={node.id} className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNodeSelect?.(node.id)}
              title={
                bounced
                  ? `${displayLabel} · Bounced${node.recipientEmail ? ` (${node.recipientEmail})` : ""}`
                  : opened
                    ? `${displayLabel} · Opened`
                    : isDone && node.kind === "sent"
                      ? `${displayLabel} · Sent`
                      : node.state === "scheduled" && node.at
                        ? `${displayLabel} · Next in ${countdownToLabel(node.at)}`
                        : displayLabel
              }
              className={cn(
                "ish-email-tb-pill flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold tracking-wide",
                node.state === "upcoming" && !selected && "opacity-70",
              )}
              data-state={node.state}
              data-selected={selected ? "true" : undefined}
              data-opened={opened ? "true" : undefined}
              data-bounced={bounced ? "true" : undefined}
            >
              {bounced ? (
                <Ban className="size-2.5 shrink-0" strokeWidth={2.5} />
              ) : opened ? (
                <Eye className="size-2.5 shrink-0" strokeWidth={2.5} />
              ) : (
                isDone && <Check className="size-2.5 shrink-0" strokeWidth={2.5} />
              )}
              <span>{displayLabel}</span>
            </button>
            {i < nodes.length - 1 && (
              <div
                className={cn(
                  "h-px w-3 rounded-full",
                  isDone || opened ? "bg-brand-stratus-blue/45" : "bg-brand-stratus-blue/18",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function OutreachJourneyPanel({
  thread,
  processActions,
  selectedNodeId,
  onNodeSelect,
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!thread?.barNodes.some((n) => n.state === "scheduled" || n.state === "paused")) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [thread?.barNodes]);

  void tick;

  if (!thread) return null;

  const showBar = thread.barMode !== "hidden" && thread.barNodes.length > 0;
  const activeId = selectedNodeId ?? thread.selectedNodeId;

  return (
    <div className="mb-1 min-w-0 lg:mb-1.5">
      <div className="ish-email-toolbar flex min-w-0 flex-row flex-wrap items-center gap-1.5 rounded-[14px] border px-2 py-1 lg:flex-nowrap lg:gap-2 lg:px-2.5 lg:py-1.5">
        {showBar ? (
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
            <ProgressStrip
              nodes={thread.barNodes}
              selectedNodeId={activeId}
              onNodeSelect={onNodeSelect}
            />
          </div>
        ) : null}

        {processActions ? (
          <div className="ish-email-tb-actions ml-auto shrink-0">{processActions}</div>
        ) : null}
      </div>
    </div>
  );
}
