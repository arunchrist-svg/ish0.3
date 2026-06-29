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
        "fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm",
        className,
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "ish-modal-panel w-full max-w-md rounded-[22px] border border-ish-border p-6 shadow-[var(--shadow-ish-float)]",
          panelClassName,
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
