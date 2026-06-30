"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  panelClassName?: string;
};

export function AppModal({ open, children, onClose, className, panelClassName }: Props) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] lg:items-center lg:bg-black/65 lg:p-4 lg:backdrop-blur-sm",
        className,
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "ish-modal-panel ish-bottom-sheet w-full max-h-[min(92dvh,720px)] overflow-y-auto rounded-t-3xl border border-ish-border bg-white p-6 shadow-2xl",
          "lg:max-h-none lg:max-w-md lg:rounded-[22px] lg:p-6 lg:shadow-[var(--shadow-ish-float)]",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ish-border lg:hidden" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}
