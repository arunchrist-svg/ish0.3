"use client";

import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueItem as QueueItemType } from "@/lib/data";
import { IshAvatar, ScoreBadge } from "@/design-system";

type Props = {
  item: QueueItemType;
  index: number;
  active: boolean;
  onClick: () => void;
};

export function QueueItemCard({ item, index, active, onClick }: Props) {
  const Icon = item.icon === "mail" ? Mail : Phone;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ish-queue-card mb-2 w-full cursor-pointer rounded-[18px] p-4 text-left transition-all duration-150",
        active
          ? "ish-queue-card-active bg-ish-yellow-gradient"
          : "bg-white shadow-[var(--shadow-ish-sm)] hover:brightness-[0.98]",
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
        <div className="flex size-[30px] items-center justify-center rounded-full bg-white/60">
          <Icon className="size-3.5 text-ish-ink-soft" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-white/55 px-2 py-0.5 text-[10.5px] font-bold text-ish-ink-soft">
            {item.type}
          </span>
          <span className="text-[11px] text-ish-ink-faint">{item.date}</span>
        </div>
        <ScoreBadge score={item.score} />
      </div>
    </button>
  );
}
