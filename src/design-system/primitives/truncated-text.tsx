"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const CONTENT_CLASS =
  "max-w-[min(280px,80vw)] rounded-xl border border-brand-stratus-blue/25 bg-white/95 px-3 py-2 text-[12px] font-medium leading-snug text-brand-ink shadow-[var(--shadow-brand)] backdrop-blur-md [&_[class*='rotate-45']]:border-brand-stratus-blue/25 [&_[class*='rotate-45']]:bg-white [&_[class*='rotate-45']]:fill-white";

const LONG_PRESS_MS = 450;

type Props = {
  text: string;
  className?: string;
  /** Visible lines at rest. Default single-line ellipsis. */
  lines?: 1 | 2;
  /** Expand to two lines when an ancestor with `group` is hovered (only when `lines` is 1). */
  expandOnGroupHover?: boolean;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Truncated label with full text on hover/focus (accessible tooltip),
 * optional in-card expand on group hover, and touch long-press + native title fallback.
 */
export function TruncatedText({
  text,
  className,
  lines = 1,
  expandOnGroupHover = false,
  side = "top",
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const openedByLongPress = useRef(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    };

    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, className, lines, expandOnGroupHover]);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  if (!text) return null;

  const label = (
    <span
      ref={ref}
      title={isOverflowing ? text : undefined}
      className={cn(
        "block min-w-0 max-w-full",
        lines === 2 ? "line-clamp-2 break-words" : "truncate",
        lines === 1 &&
          expandOnGroupHover &&
          "group-hover:line-clamp-2 group-hover:whitespace-normal group-hover:break-words",
        className,
      )}
      onPointerDown={(event) => {
        if (!isOverflowing || event.pointerType !== "touch") return;
        clearLongPress();
        openedByLongPress.current = false;
        longPressTimer.current = window.setTimeout(() => {
          openedByLongPress.current = true;
          setOpen(true);
          longPressTimer.current = null;
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onClick={(event) => {
        if (!openedByLongPress.current) return;
        event.preventDefault();
        event.stopPropagation();
        openedByLongPress.current = false;
      }}
    >
      {text}
    </span>
  );

  return (
    <Tooltip disabled={!isOverflowing} open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        delay={180}
        closeOnClick={false}
        render={<span className="block min-w-0 max-w-full outline-none" />}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side={side} className={CONTENT_CLASS}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
