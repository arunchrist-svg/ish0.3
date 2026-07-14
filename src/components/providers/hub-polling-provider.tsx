"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

type NotificationsContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => void;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
};

type InboxBadgeContextValue = {
  count: number;
  refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const InboxBadgeContext = createContext<InboxBadgeContextValue | null>(null);

export function HubPollingProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  const refreshNotifications = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      })
      .catch(() => {});
  }, []);

  const refreshInboxBadge = useCallback(() => {
    fetch("/api/email/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setInboxCount((data.needsReview ?? 0) + (data.replies ?? 0));
      })
      .catch(() => {});
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    refreshNotifications();
  }, [refreshNotifications]);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    refreshNotifications();
    const interval = window.setInterval(refreshNotifications, 30_000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  useEffect(() => {
    refreshInboxBadge();
    const interval = window.setInterval(refreshInboxBadge, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshInboxBadge]);

  const notificationsValue = useMemo(
    () => ({ notifications, unreadCount, refresh: refreshNotifications, markRead, markAllRead }),
    [notifications, unreadCount, refreshNotifications, markRead, markAllRead],
  );

  const inboxValue = useMemo(
    () => ({ count: inboxCount, refresh: refreshInboxBadge }),
    [inboxCount, refreshInboxBadge],
  );

  return (
    <NotificationsContext.Provider value={notificationsValue}>
      <InboxBadgeContext.Provider value={inboxValue}>{children}</InboxBadgeContext.Provider>
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within HubPollingProvider");
  return ctx;
}

export function useInboxBadge() {
  const ctx = useContext(InboxBadgeContext);
  if (!ctx) throw new Error("useInboxBadge must be used within HubPollingProvider");
  return ctx;
}
