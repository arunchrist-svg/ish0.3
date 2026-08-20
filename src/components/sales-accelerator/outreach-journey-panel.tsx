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
  onDraftReply?: () => void;
  draftReplyLoading?: boolean;
};

function BarStepper({
  nodes,
  selectedNodeId,
  onNodeSelect,
  onDraftReply,
  draftReplyLoading,
}: {
  nodes: BarNode[];
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
  onDraftReply?: () => void;
  draftReplyLoading?: boolean;
}) {
  function countdownToLabel(at?: string): string | null {
    if (!at) return null;
    const diff = new Date(at).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
    return `${days}D`;
  }

  return (
    <div className="flex flex-nowrap items-center gap-1">
      {nodes.map((node, i) => {
        const selected = selectedNodeId === node.id;
        const isDone = node.state === "done";
        const opened = Boolean(node.openedAt);
        const bounced = Boolean(node.bouncedAt);
        const countdown = node.state === "scheduled" ? countdownToLabel(node.at) : null;
        const displayLabel =
          countdown && countdown.length > 0
            ? `${node.label} (${countdown})`
            : node.label;

        return (
          <div key={node.id} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onNodeSelect?.(node.id)}
              title={
                bounced
                  ? `${displayLabel} · Bounced${node.recipientEmail ? ` (${node.recipientEmail})` : ""}`
                  : opened
                    ? `${displayLabel} · Opened`
                    : isDone && node.kind === "sent"
                      ? `${displayLabel} · Sent, not opened`
                      : node.state === "scheduled" && node.at
                        ? `${displayLabel} · Next in ${countdownToLabel(node.at)}`
                        : displayLabel
              }
              className={cn(
                "ish-email-tb-pill flex h-6 items-center gap-0.5 rounded-full px-2 text-[10px] font-semibold tracking-wide",
                node.state === "upcoming" && "opacity-70",
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
              {node.action === "draft_reply" && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDraftReply?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      onDraftReply?.();
                    }
                  }}
                  className="ml-0.5 rounded-full bg-brand-stratus-blue px-1.5 py-0.5 text-[8px] font-bold normal-case tracking-normal text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)] hover:opacity-90"
                >
                  {draftReplyLoading ? "…" : "AI reply"}
                </span>
              )}
            </button>
            {i < nodes.length - 1 && (
              <div
                className={cn(
                  "h-px w-2 rounded-full",
                  isDone || opened ? "bg-brand-stratus-blue/40" : "bg-brand-stratus-blue/15",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NodeDetailPanel({ node }: { node: BarNode }) {
  if (node.kind === "draft" || node.kind === "reply_draft") return null;

  return (
    <div className="bg-brand-canvas/40 px-3 py-3 lg:mt-3 lg:rounded-[16px] lg:border lg:border-brand-border/60 lg:bg-brand-canvas/30 lg:px-4 lg:py-3">
      {node.subject && <p className="text-[13px] font-semibold text-brand-ink">{node.subject}</p>}
      {(node.body || node.snippet) && (
        <p className="mt-2.5 whitespace-pre-wrap text-[13px] leading-relaxed text-brand-ink-soft">
          {node.body ?? node.snippet}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-brand-ink-faint">
        {node.at && (
          <span>
            {new Date(node.at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {node.kind === "sent" && node.bouncedAt && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft px-2 py-0.5 font-bold text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/30">
            <Ban className="size-2.5" />
            Bounced
            {node.recipientEmail ? ` · ${node.recipientEmail}` : ""}
          </span>
        )}
        {node.kind === "sent" && node.bouncedAt && node.bounceReason && (
          <span className="w-full text-[11px] font-medium leading-relaxed text-brand-stratus-salmon">
            {node.bounceReason}
          </span>
        )}
        {node.kind === "sent" && !node.bouncedAt && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
              node.openedAt
                ? "bg-brand-stratus-yellow/25 text-brand-ink ring-1 ring-brand-stratus-yellow/40"
                : "bg-brand-canvas text-brand-ink-soft ring-1 ring-brand-border",
            )}
          >
            {node.openedAt ? (
              <>
                <Eye className="size-2.5" />
                Opened{" "}
                {new Date(node.openedAt).toLocaleString("en-IN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            ) : (
              "Not opened"
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function OutreachJourneyPanel({
  thread,
  processActions,
  selectedNodeId,
  onNodeSelect,
  onDraftReply,
  draftReplyLoading,
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
  const selectedNode = thread.barNodes.find((n) => n.id === activeId);

  return (
    <div className="mb-2 min-w-0 lg:mb-3">
      <div className="ish-email-toolbar flex min-w-0 flex-row flex-wrap items-center gap-1.5 rounded-[18px] border px-2 py-1.5 lg:flex-nowrap lg:gap-2.5 lg:px-2.5 lg:py-2">
        {showBar ? (
          <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
            <BarStepper
              nodes={thread.barNodes}
              selectedNodeId={activeId}
              onNodeSelect={onNodeSelect}
              onDraftReply={onDraftReply}
              draftReplyLoading={draftReplyLoading}
            />
          </div>
        ) : null}

        {processActions ? (
          <div className="ish-email-tb-actions ml-auto shrink-0">
            {processActions}
          </div>
        ) : null}
      </div>

      {selectedNode && (selectedNode.kind === "sent" || selectedNode.kind === "inbound" || selectedNode.kind === "scheduled") ? (
        <div className="mt-2 overflow-hidden rounded-[16px] border border-brand-stratus-blue/15 bg-white/90 px-3 py-3 shadow-[var(--shadow-brand-sm)] lg:px-4">
          <NodeDetailPanel node={selectedNode} />
        </div>
      ) : null}
    </div>
  );
}
