"use client";

import { cn } from "@/lib/utils";
import type { SequenceFlowModel, SequenceFlowNode } from "@/lib/email/sequence-flow";

type Props = {
  model: SequenceFlowModel;
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
  density?: "compact" | "live";
  interactive?: boolean;
  /** Sit inside the email toolbar: no glass rail, no reply card. */
  embedded?: boolean;
};

function chipStatusLabel(node: SequenceFlowNode): string | undefined {
  if (node.opened && node.slot !== "opened" && node.slot !== "replied") {
    return "Opened";
  }
  return node.cadenceLabel;
}

function Chip({
  node,
  selected,
  interactive,
  onSelect,
}: {
  node: SequenceFlowNode;
  selected: boolean;
  interactive: boolean;
  onSelect?: (id: string) => void;
}) {
  const statusLabel = chipStatusLabel(node);
  const className = cn(
    "ish-seq-chip",
    selected && "is-selected",
    node.opened && "is-opened",
    node.state === "done" && "is-done",
    node.state === "skipped" && "is-skipped",
    node.slot === "opened" && "is-if-opened",
    node.slot === "replied" && "is-if-replied",
  );
  const inner = (
    <>
      <span className="ish-seq-chip-title">{node.label}</span>
      {statusLabel ? <span className="ish-seq-chip-days">{statusLabel}</span> : null}
    </>
  );

  if (!interactive) {
    return (
      <div className={className} title={node.title}>
        {inner}
      </div>
    );
  }

  return (
    <button type="button" className={className} title={node.title} onClick={() => onSelect?.(node.id)}>
      {inner}
    </button>
  );
}

export function SequenceFlowMap({
  model,
  selectedNodeId,
  onNodeSelect,
  density = "live",
  interactive = true,
  embedded = false,
}: Props) {
  const compact = density === "compact";
  const emails = model.nodes.filter((n) => n.slot !== "opened" && n.slot !== "replied");
  const ifOpened = model.nodes.find((n) => n.slot === "opened");
  const ifReplied = model.nodes.find((n) => n.slot === "replied");
  const replySelected =
    selectedNodeId === ifReplied?.id || selectedNodeId === "reply-draft";

  return (
    <div
      className={cn(
        "ish-seq-flow",
        compact && "ish-seq-flow--compact",
        embedded && "ish-seq-flow--embedded",
      )}
      data-mode={model.mode}
    >
      <div className="ish-seq-rail" role="list">
        {emails.map((node, index) => (
          <span key={node.id} className="ish-seq-rail-item" role="listitem">
            {index > 0 ? <span className="ish-seq-dot" aria-hidden /> : null}
            <Chip
              node={node}
              selected={Boolean(interactive && selectedNodeId === node.id)}
              interactive={interactive}
              onSelect={onNodeSelect}
            />
          </span>
        ))}
        {ifOpened ? (
          <>
            <span className="ish-seq-pipe" aria-hidden />
            <span className="ish-seq-rail-item" role="listitem">
              <Chip
                node={ifOpened}
                selected={Boolean(interactive && selectedNodeId === ifOpened.id)}
                interactive={interactive}
                onSelect={onNodeSelect}
              />
            </span>
          </>
        ) : null}
        {ifReplied ? (
          <>
            <span className="ish-seq-pipe" aria-hidden />
            <span className="ish-seq-rail-item" role="listitem">
              <Chip
                node={ifReplied}
                selected={Boolean(interactive && replySelected)}
                interactive={interactive}
                onSelect={onNodeSelect}
              />
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
