"use client";

import { useCallback, useEffect, useState } from "react";

export function useInboxBadge() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    fetch("/api/email/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCount((data.needsReview ?? 0) + (data.replies ?? 0));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { count, refresh };
}
