"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BarNode, EmailThread } from "@/lib/api-client";

type Props = {
  thread?: EmailThread;
  statusSubtitle: string;
  toolbar?: ReactNode;
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
    <div className="flex flex-wrap items-center gap-1.5">
      {nodes.map((node, i) => {
        const selected = selectedNodeId === node.id;
        const isDone = node.state === "done";
        return (
          <div key={node.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNodeSelect?.(node.id)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full px-2.5 text-[9px] font-bold uppercase tracking-wide transition-colors",
                isDone && "border border-ish-stratus-blue/25 bg-ish-green-soft text-ish-stratus-blue",
                node.state === "current" && "bg-ish-yellow-soft text-ish-ink ring-2 ring-ish-stratus-yellow/55",
                node.state === "scheduled" && "border border-dashed border-ish-stratus-blue/35 bg-white text-ish-stratus-blue",
                node.state === "upcoming" && "bg-ish-canvas/80 text-ish-ink-faint",
                selected && "ring-2 ring-ish-black/15",
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
                  className="ml-0.5 rounded-full bg-ish-black px-1.5 py-0.5 text-[8px] font-bold normal-case tracking-normal text-white hover:bg-ish-black/90"
                >
                  {draftReplyLoading ? "…" : "Draft"}
                </span>
              )}
            </button>
            {i < nodes.length - 1 && (
              <div
                className={cn(
                  "h-px w-3 rounded-full",
                  isDone ? "bg-ish-stratus-blue/35" : "bg-ish-border",
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
    <div className="mt-3 rounded-[16px] border border-ish-border/60 bg-ish-canvas/30 px-4 py-3">
      {node.subject && (
        <p className="text-[12px] font-semibold text-ish-ink">{node.subject}</p>
      )}
      {(node.body || node.snippet) && (
        <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ish-ink-soft">
          {node.body ?? node.snippet}
        </p>
      )}
      {node.at && (
        <p className="mt-2 text-[10px] text-ish-ink-faint">
          {new Date(node.at).toLocaleString("en-IN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

export function OutreachJourneyPanel({
  thread,
  statusSubtitle,
  toolbar,
  selectedNodeId,
  onNodeSelect,
  onDraftReply,
  draftReplyLoading,
}: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!thread?.barNodes.some((n) => n.state === "scheduled")) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [thread?.barNodes]);

  void tick;

  if (!thread) return null;

  const showBar = thread.barMode !== "hidden" && thread.barNodes.length > 0;
  const activeId = selectedNodeId ?? thread.selectedNodeId;
  const selectedNode = thread.barNodes.find((n) => n.id === activeId);

  return (
    <div className="mb-4">
      <div className="ish-record-card overflow-hidden rounded-[20px] border border-ish-border/60 bg-white shadow-[var(--shadow-ish-sm)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-ish-green-soft">
              <Mail className="size-3.5 text-ish-stratus-blue" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight text-ish-ink">Email Outreach</div>
              <div className="truncate text-[10px] text-ish-ink-faint">{statusSubtitle}</div>
            </div>
          </div>

          {showBar ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {thread.threadRootSubject && (
                <span className="hidden rounded-full border border-ish-stratus-blue/20 bg-ish-green-soft/60 px-2 py-0.5 text-[10px] font-semibold text-ish-stratus-blue sm:inline">
                  {thread.threadRootSubject}
                </span>
              )}
              <BarStepper
                nodes={thread.barNodes}
                selectedNodeId={activeId}
                onNodeSelect={onNodeSelect}
                onDraftReply={onDraftReply}
                draftReplyLoading={draftReplyLoading}
              />
            </div>
          ) : null}

          {toolbar ? (
            <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1", !showBar && "ml-auto flex-1")}>
              {toolbar}
            </div>
          ) : null}
        </div>

        {selectedNode && (selectedNode.kind === "sent" || selectedNode.kind === "inbound" || selectedNode.kind === "scheduled") ? (
          <div className="border-t border-ish-border/50 px-4 py-3">
            <NodeDetailPanel node={selectedNode} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
