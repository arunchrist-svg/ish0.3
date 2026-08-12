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
  return (
    <div className="flex flex-nowrap items-center gap-1">
      {nodes.map((node, i) => {
        const selected = selectedNodeId === node.id;
        const isDone = node.state === "done";
        const opened = Boolean(node.openedAt);
        const bounced = Boolean(node.bouncedAt);
        return (
          <div key={node.id} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onNodeSelect?.(node.id)}
              title={
                bounced
                  ? `${node.label} · Bounced${node.recipientEmail ? ` (${node.recipientEmail})` : ""}`
                  : opened
                    ? `${node.label} · Opened`
                    : isDone && node.kind === "sent"
                      ? `${node.label} · Sent, not opened`
                      : node.label
              }
              className={cn(
                "flex h-6 items-center gap-0.5 rounded-full px-2 text-[10px] font-semibold tracking-wide transition-colors",
                bounced && "border border-brand-stratus-salmon/40 bg-brand-pink-soft text-brand-stratus-salmon",
                opened && !bounced && "border border-orange-200 bg-orange-50 text-orange-600",
                isDone && !opened && !bounced && "border border-brand-stratus-blue/25 bg-brand-green-soft text-brand-stratus-blue",
                node.state === "current" && "border border-brand-stratus-yellow/50 bg-brand-yellow-soft text-brand-ink",
                node.state === "scheduled" && "border border-dashed border-brand-stratus-blue/35 bg-white text-brand-stratus-blue",
                node.state === "paused" && "border border-dashed border-brand-stratus-salmon/35 bg-brand-pink-soft/30 text-brand-stratus-salmon",
                node.state === "upcoming" && "border border-transparent bg-brand-canvas/80 text-brand-ink-faint",
                selected && "border-brand-ink/25",
              )}
            >
              {bounced ? (
                <Ban className="size-2.5 shrink-0" strokeWidth={2.5} />
              ) : opened ? (
                <Eye className="size-2.5 shrink-0" strokeWidth={2.5} />
              ) : (
                isDone && <Check className="size-2.5 shrink-0" strokeWidth={2.5} />
              )}
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
              <div className={cn("h-px w-2 rounded-full", isDone || opened ? "bg-brand-stratus-blue/35" : "bg-brand-border")} />
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
                ? "bg-orange-50 text-orange-600 ring-1 ring-orange-200/80"
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
      <div className="flex h-8 min-w-0 items-center gap-1.5 overflow-hidden rounded-full border border-brand-stratus-blue/20 bg-white/90 px-1.5 shadow-[var(--shadow-brand-sm)] backdrop-blur-sm lg:px-2">
        {showBar ? (
          <div className="min-w-0 shrink">
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
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
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
