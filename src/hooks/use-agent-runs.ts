"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentRunItem } from "@/design-system/patterns/agent-status-bar";

type AgentRunsResponse = {
  runs: (AgentRunItem & { startedAt: string; completedAt: string | null })[];
};

export function useAgentRuns(pollMs = 8000) {
  const [runs, setRuns] = useState<AgentRunItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/runs/active");
      if (!res.ok) return;
      const data = (await res.json()) as AgentRunsResponse;
      setRuns(data.runs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { runs, refresh };
}
