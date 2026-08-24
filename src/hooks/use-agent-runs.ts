"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRunItem } from "@/design-system/patterns/agent-status-bar";

type AgentRunsResponse = {
  runs: (AgentRunItem & { startedAt: string; completedAt: string | null })[];
};

const ACTIVE_POLL_MS = 8_000;

export function useAgentRuns(pollMs = ACTIVE_POLL_MS) {
  const [runs, setRuns] = useState<AgentRunItem[]>([]);
  const hasRunning = runs.some((r) => r.status === "running");

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/agents/runs/active");
      if (!res.ok) return;
      const data = (await res.json()) as AgentRunsResponse;
      setRuns(data.runs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refreshRef.current();

    function onVisible() {
      if (document.visibilityState === "visible") void refreshRef.current();
    }
    document.addEventListener("visibilitychange", onVisible);

    // Interval only while a run is actively running.
    let id: number | undefined;
    if (hasRunning) {
      id = window.setInterval(() => void refreshRef.current(), pollMs);
    }

    return () => {
      if (id != null) window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs, hasRunning]);

  return { runs, refresh };
}
