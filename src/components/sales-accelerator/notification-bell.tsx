"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";

type Props = {
  compact?: boolean;
  className?: string;
};

export function NotificationBell({ compact = false, className }: Props) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center rounded-full border border-brand-border bg-white text-brand-ink shadow-[var(--shadow-brand-sm)] hover:bg-brand-canvas",
          compact ? "size-8" : "size-9",
        )}
        aria-label="Notifications"
      >
        <Bell className={cn(compact ? "size-3.5" : "size-4")} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-stratus-salmon text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[var(--shadow-brand-md)] lg:bottom-auto lg:left-full lg:top-0 lg:mb-0 lg:ml-2">
          <div className="flex items-center justify-between border-b border-brand-border px-4 py-2.5">
            <span className="text-[13px] font-bold text-brand-ink">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllRead()} className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-brand-ink-soft">No new notifications</p>
            ) : (
              notifications.map((n) => {
                const leadUrl = n.leadId ? `/leads/${n.leadId}?tab=Email` : "#";
                return (
                  <Link
                    key={n.id}
                    href={leadUrl}
                    onClick={() => { void markRead([n.id]); setOpen(false); }}
                    className={cn(
                      "block border-b border-brand-border/60 px-4 py-3 hover:bg-brand-canvas",
                      n.urgency === "urgent" && "bg-brand-pink-soft/40",
                    )}
                  >
                    <div className="text-[12px] font-semibold text-brand-ink">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-brand-ink-soft">{n.body}</div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
