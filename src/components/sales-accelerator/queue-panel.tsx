"use client";

import { Calendar, RefreshCw, Search, Mail } from "lucide-react";
import { CircleButton, IshAvatar, ScoreBadge, Separator } from "@/design-system";
import { SlidingHighlight } from "@/design-system/primitives/sliding-highlight";
import { useSlidingHighlight } from "@/design-system/hooks/use-sliding-highlight";
import { cn } from "@/lib/utils";
import type { LeadQueueItem } from "@/lib/api-client";

type Props = {
  leads: LeadQueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
};

export function QueuePanel({ leads, activeId, onSelect }: Props) {
  const today = leads.slice(0, Math.min(3, leads.length));
  const older = leads.slice(3);
  const { containerRef, register, rect, ready } = useSlidingHighlight(activeId);

  return (
    <div className="flex h-full w-[330px] shrink-0 flex-col border-r border-white/50 ish-glass-sidebar p-[22px_18px]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xl font-bold text-ish-ink">My Leads</span>
        <div className="flex gap-1.5">
          <CircleButton size={30}><RefreshCw className="size-3.5" /></CircleButton>
          <CircleButton size={30}><Calendar className="size-3.5" /></CircleButton>
          <CircleButton size={30}><Search className="size-3.5" /></CircleButton>
        </div>
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-y-auto px-2 -mx-2 scrollbar-none">
        <SlidingHighlight
          rect={rect}
          ready={ready}
          className="rounded-[18px] bg-ish-yellow-gradient shadow-[var(--shadow-ish-yellow)]"
        />

        {today.length > 0 && (
          <>
            <div className="mb-2.5 mt-4 text-xs font-semibold text-ish-ink-faint">RECENT</div>
            {today.map((item, i) => (
              <QueueCard
                key={item.id}
                item={item}
                index={i}
                active={activeId === item.id}
                register={register(item.id)}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </>
        )}

        {older.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-2.5">
              <Separator className="flex-1 bg-ish-border" />
              <span className="text-[11.5px] font-semibold text-ish-ink-faint">EARLIER</span>
              <Separator className="flex-1 bg-ish-border" />
            </div>
            {older.map((item, i) => (
              <QueueCard
                key={item.id}
                item={item}
                index={i + 3}
                active={activeId === item.id}
                register={register(item.id)}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function emailStatusDot(status: string) {
  if (status === "verified") return "bg-ish-green";
  if (status === "unverified") return "bg-[#e8a000]";
  return "bg-ish-ink-faint";
}

function QueueCard({
  item,
  index,
  active,
  register,
  onClick,
}: {
  item: LeadQueueItem;
  index: number;
  active: boolean;
  register: (node: HTMLElement | null) => void;
  onClick: () => void;
}) {
  return (
    <button
      ref={register}
      type="button"
      onClick={onClick}
      className={cn(
        "relative z-10 mb-2.5 w-full cursor-pointer rounded-[18px] p-4 text-left",
        "transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:translate-y-[-1px] active:scale-[0.99]",
        active
          ? "shadow-[var(--shadow-ish-yellow)]"
          : "bg-white shadow-[var(--shadow-ish-sm)] hover:shadow-[var(--shadow-ish)]",
      )}
    >
      <div className="mb-3.5 flex items-start justify-between">
        <div className="flex gap-3">
          <IshAvatar name={item.name} index={index} size={42} />
          <div>
            <div className="text-[14.5px] font-bold text-ish-ink">{item.name}</div>
            <div className="mt-0.5 text-xs text-ish-ink-soft">{item.action}</div>
          </div>
        </div>
        <div
          className={cn(
            "flex size-[30px] items-center justify-center rounded-full bg-white/60",
            "transition-transform duration-300",
            active && "scale-110",
          )}
        >
          <Mail className="size-3.5 text-ish-ink-soft" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-white/55 px-2 py-0.5 text-[10.5px] font-bold text-ish-ink-soft">
            {item.status}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-ish-ink-faint">
            <span className={cn("size-1.5 rounded-full", emailStatusDot(item.emailStatus))} />
            {item.emailStatus}
          </span>
        </div>
        <ScoreBadge score={item.score} />
      </div>
    </button>
  );
}
