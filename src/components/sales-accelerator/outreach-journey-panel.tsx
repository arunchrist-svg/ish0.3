"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BarNode, EmailThread } from "@/lib/api-client";

type Props = {
  thread?: EmailThread;
  statusSubtitle: string;
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nodes.map((node, i) => {
        const selected = selectedNodeId === node.id;
        const isDone = node.state === "done";
        return (
          <div key={node.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNodeSelect?.(node.id)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full px-2.5 text-[9px] font-bold uppercase tracking-wide transition-colors",
                isDone && "border border-brand-stratus-blue/25 bg-brand-green-soft text-brand-stratus-blue",
                node.state === "current" && "bg-brand-yellow-soft text-brand-ink ring-2 ring-brand-stratus-yellow/55",
                node.state === "scheduled" && "border border-dashed border-brand-stratus-blue/35 bg-white text-brand-stratus-blue",
                node.state === "paused" && "border border-dashed border-brand-stratus-salmon/35 bg-brand-pink-soft/30 text-brand-stratus-salmon",
                node.state === "upcoming" && "bg-brand-canvas/80 text-brand-ink-faint",
                selected && "ring-2 ring-brand-black/15",
              )}
            >
              {isDone && <Check className="size-3 shrink-0" strokeWidth={2.5} />}
              <span>{node.label}</span>
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
                  className="ml-0.5 rounded-full bg-brand-black px-1.5 py-0.5 text-[8px] font-bold normal-case tracking-normal text-white hover:bg-brand-black/90"
                >
                  {draftReplyLoading ? "…" : "AI reply"}
                </span>
              )}
            </button>
            {i < nodes.length - 1 && (
              <div className={cn("h-px w-3 rounded-full", isDone ? "bg-brand-stratus-blue/35" : "bg-brand-border")} />
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
      {node.at && (
        <p className="mt-3 text-[10px] text-brand-ink-faint">
          {new Date(node.at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

export function OutreachJourneyPanel({
  thread,
  statusSubtitle,
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
    <div className="mb-3 lg:mb-4">
      <div className="border-b border-brand-border/60 bg-white lg:ish-record-card lg:overflow-hidden lg:rounded-[20px] lg:border lg:shadow-[var(--shadow-brand-sm)]">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:gap-3 lg:px-4 lg:py-2.5 [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-brand-green-soft">
              <Mail className="size-3.5 text-brand-stratus-blue" />
            </div>
            <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[13px] font-bold leading-none text-brand-ink">Outreach Queue</span>
              <span className="text-[10px] text-brand-ink-faint">· {statusSubtitle}</span>
            </div>
          </div>

          {showBar ? (
            <>
              <div className="hidden h-5 w-px shrink-0 bg-brand-border/70 sm:block" aria-hidden />
              <div className="shrink-0">
                <BarStepper
                  nodes={thread.barNodes}
                  selectedNodeId={activeId}
                  onNodeSelect={onNodeSelect}
                  onDraftReply={onDraftReply}
                  draftReplyLoading={draftReplyLoading}
                />
              </div>
            </>
          ) : null}

          {processActions ? (
            <>
              <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">{processActions}</div>
            </>
          ) : null}
        </div>

        {selectedNode && (selectedNode.kind === "sent" || selectedNode.kind === "inbound" || selectedNode.kind === "scheduled") ? (
          <div className="border-t border-brand-border/50 px-3 py-3 lg:px-4 lg:py-3">
            <NodeDetailPanel node={selectedNode} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
