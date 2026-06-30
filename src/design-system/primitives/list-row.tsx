"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type ListRowProps = {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  className?: string;
};

export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  trailing,
  showChevron = false,
  href,
  onClick,
  destructive = false,
  className,
}: ListRowProps) {
  const content = (
    <>
      {icon ? <span className="flex size-8 shrink-0 items-center justify-center text-ish-ink-soft">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className={cn(text.listTitle, destructive && "text-ish-stratus-salmon")}>{title}</div>
        {subtitle ? <div className={text.listSubtitle}>{subtitle}</div> : null}
        {meta ? <div className={cn(text.listMeta, "mt-0.5")}>{meta}</div> : null}
      </div>
      {trailing}
      {showChevron ? <ChevronRight className="size-5 shrink-0 text-ish-ink-faint" aria-hidden /> : null}
    </>
  );

  const rowClass = cn("ish-list-row ish-touch-target", className);

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(rowClass, "w-full text-left")}>
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}
