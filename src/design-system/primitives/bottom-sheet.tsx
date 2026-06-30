"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  contentClassName,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          "ish-bottom-sheet relative flex max-h-[min(90dvh,720px)] w-full flex-col rounded-t-3xl bg-white shadow-2xl",
          "lg:max-w-lg lg:rounded-3xl",
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ish-border lg:hidden" aria-hidden />
        {title ? (
          <div className="flex items-center justify-between border-b border-ish-border/60 px-4 py-3">
            <h2 className={text.pageTitle}>{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex size-10 items-center justify-center rounded-full bg-ish-canvas text-ish-ink active:scale-95"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        ) : null}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", contentClassName ?? "p-4")}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-ish-border/60 bg-white px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
