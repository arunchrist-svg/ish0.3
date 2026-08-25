"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EmailThread } from "@/lib/api-client";
import { buildSequenceFlow } from "@/lib/email/sequence-flow";
import { SequenceFlowMap } from "./sequence-flow-map";

type Props = {
  thread?: EmailThread;
  processActions?: ReactNode;
  selectedNodeId?: string;
  onNodeSelect?: (nodeId: string) => void;
};

export function OutreachJourneyPanel({
  thread,
  processActions,
  selectedNodeId,
  onNodeSelect,
}: Props) {
  const flow = useMemo(() => buildSequenceFlow(thread), [thread]);

  if (!thread) return null;

  const showMap = thread.barMode !== "hidden" && thread.barNodes.length > 0;
  const activeId = selectedNodeId ?? thread.selectedNodeId;
  if (!showMap && !processActions) return null;

  return (
    <div className="mb-1 min-w-0 space-y-1.5 lg:mb-1.5">
      {showMap || processActions ? (
        <div
          className={cn(
            "ish-email-toolbar flex min-w-0 flex-row flex-nowrap items-center gap-1 rounded-[12px] border px-1.5 py-1",
          )}
        >
          {showMap ? (
            <div className="ish-email-tb-seq min-w-0 flex-1 overflow-x-auto">
              <SequenceFlowMap
                model={flow}
                selectedNodeId={activeId}
                onNodeSelect={onNodeSelect}
                density="live"
                embedded
              />
            </div>
          ) : null}
          {processActions ? (
            <div className="ish-email-tb-actions ml-auto shrink-0">{processActions}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
