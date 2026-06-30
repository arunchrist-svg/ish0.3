"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationBell() {
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-full border border-ish-border bg-white text-ish-ink shadow-[var(--shadow-ish-sm)] hover:bg-ish-canvas"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-ish-stratus-salmon text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-ish-border bg-white shadow-[var(--shadow-ish-md)]">
          <div className="flex items-center justify-between border-b border-ish-border px-4 py-2.5">
            <span className="text-[13px] font-bold text-ish-ink">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={() => markAllRead()} className="text-[11px] font-semibold text-ish-ink-soft hover:text-ish-ink">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-ish-ink-soft">No new notifications</p>
            ) : (
              notifications.map((n) => {
                const leadUrl = n.leadId ? `/leads/${n.leadId}?tab=Email` : "#";
                return (
                  <Link
                    key={n.id}
                    href={leadUrl}
                    onClick={() => { void markRead([n.id]); setOpen(false); }}
                    className={cn(
                      "block border-b border-ish-border/60 px-4 py-3 hover:bg-ish-canvas",
                      n.urgency === "urgent" && "bg-ish-pink-soft/40",
                    )}
                  >
                    <div className="text-[12px] font-semibold text-ish-ink">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-ish-ink-soft">{n.body}</div>
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
