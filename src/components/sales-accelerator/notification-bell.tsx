"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/use-notifications";

type Props = {
  compact?: boolean;
  className?: string;
};

function leadHref(leadId: string | null) {
  return leadId ? `/leads?lead=${leadId}&tab=email` : "#";
}

export function NotificationBell({ compact = false, className }: Props) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const placePanel = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 16);
    const gap = 8;
    const spaceRight = window.innerWidth - rect.right;
    const openRight = spaceRight >= panelWidth + gap;
    const left = openRight
      ? rect.right + gap
      : Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 280));
    setPanelStyle({ top, left, width: panelWidth });
  }, []);

  useEffect(() => {
    if (!open) return;
    placePanel();
    function handlePointer(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("resize", placePanel);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, placePanel]);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="fixed z-[80] overflow-hidden rounded-2xl border border-brand-border bg-white shadow-[var(--shadow-brand-md)]"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-2.5">
              <span className="text-[13px] font-bold text-brand-ink">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="text-[11px] font-semibold text-brand-ink-soft hover:text-brand-ink"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-brand-ink-soft">No new notifications</p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={leadHref(n.leadId)}
                    onClick={() => {
                      void markRead([n.id]);
                      setOpen(false);
                    }}
                    className={cn(
                      "block border-b border-brand-border/60 px-4 py-3 hover:bg-brand-canvas",
                      n.urgency === "urgent" && "bg-brand-pink-soft/40",
                    )}
                  >
                    <div className="text-[12px] font-semibold text-brand-ink">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-brand-ink-soft">{n.body}</div>
                  </Link>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn("relative z-20 shrink-0", className)} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative z-20 flex items-center justify-center rounded-full border border-brand-border bg-white text-brand-ink shadow-[var(--shadow-brand-sm)] hover:bg-brand-canvas",
          compact ? "size-8" : "size-9",
        )}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className={cn(compact ? "size-3.5" : "size-4")} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-stratus-salmon text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
