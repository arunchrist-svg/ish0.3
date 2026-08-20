"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRunItem } from "@/design-system/patterns/agent-status-bar";

type AgentRunsResponse = {
  runs: (AgentRunItem & { startedAt: string; completedAt: string | null })[];
};

export function useAgentRuns(pollMs = 30_000) {
  const [runs, setRuns] = useState<AgentRunItem[]>([]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
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

    const id = window.setInterval(() => void refreshRef.current(), pollMs);

    function onVisible() {
      if (document.visibilityState === "visible") void refreshRef.current();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs]);

  return { runs, refresh };
}
