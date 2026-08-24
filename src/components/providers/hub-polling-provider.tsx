"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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

const BADGE_POLL_MS = 120_000;

function useVisiblePolling(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let timer: number | undefined;

    function tick() {
      if (document.visibilityState === "visible") {
        callbackRef.current();
      }
    }

    tick();
    timer = window.setInterval(tick, intervalMs);

    function onVisible() {
      if (document.visibilityState === "visible") tick();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
}

export function HubPollingProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  const refreshBadges = useCallback(() => {
    fetch("/api/hub/badge")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
        setInboxCount(data.inboxCount ?? 0);
      })
      .catch(() => {});
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    refreshBadges();
  }, [refreshBadges]);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    refreshBadges();
  }, [refreshBadges]);

  useVisiblePolling(refreshBadges, BADGE_POLL_MS);

  const notificationsValue = useMemo(
    () => ({ notifications, unreadCount, refresh: refreshBadges, markRead, markAllRead }),
    [notifications, unreadCount, refreshBadges, markRead, markAllRead],
  );

  const inboxValue = useMemo(
    () => ({ count: inboxCount, refresh: refreshBadges }),
    [inboxCount, refreshBadges],
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
