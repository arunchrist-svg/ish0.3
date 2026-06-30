"use client";

import { useCallback, useEffect, useState } from "react";

export type AppNotification = {
  id: string;
  type: string;
  leadId: string | null;
  title: string;
  body: string;
  urgency: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      })
      .catch(() => {});
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    refresh();
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return { notifications, unreadCount, refresh, markRead, markAllRead };
}
