"use client";

import { FileText, Package, Phone, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpNextTask } from "@/lib/data";
import { Button, CircleButton, PanelCard, SectionHeader } from "@/design-system";
import { toast } from "sonner";

const iconMap = {
  package: Package,
  phone: Phone,
  file: FileText,
};

function TaskCard({ task }: { task: UpNextTask }) {
  const Icon = iconMap[task.icon];

  return (
    <div
      className={cn(
        "mb-2.5 rounded-2xl p-4",
        task.active ? "bg-ish-yellow-gradient shadow-[var(--shadow-ish-yellow-sm)]" : "bg-white shadow-[var(--shadow-ish-sm)]",
      )}
    >
      <div className={cn("flex gap-3", task.active ? "mb-2.5" : "")}>
        <div
          className={cn(
            "flex size-[34px] shrink-0 items-center justify-center rounded-full text-sm",
            task.active ? "bg-ish-black text-white" : "bg-[#f2f1f4] text-ish-ink-soft",
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="flex-1">
          <div className="text-[13.5px] font-bold text-ish-ink">{task.title}</div>
          <div className="mt-0.5 text-[11px] text-ish-ink-soft">{task.step}</div>
          {!task.active && <div className="mt-1 text-[11.5px] text-ish-ink-faint">{task.desc}</div>}
        </div>
      </div>
      {task.active && (
        <>
          <div className="mb-3 pl-[45px] text-[12.5px] text-ish-ink">{task.desc}</div>
          <div className="flex gap-2 pl-[45px]">
            <Button
              size="sm"
              className="h-auto rounded-xl bg-ish-black px-4 py-2 text-xs font-semibold text-white hover:bg-ish-black/90"
              onClick={() => toast.success("Action started")}
            >
              <Package className="size-3.5" />
              {task.icon === "package" ? "Ship Box" : "Call"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-auto rounded-xl bg-white/60 px-4 py-2 text-xs font-semibold text-ish-ink hover:bg-white/80"
              onClick={() => toast.success(task.primaryAction ?? "Marked complete")}
            >
              {task.primaryAction ?? "Mark Complete"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  tasks: UpNextTask[];
};

export function UpNextPanel({ tasks }: Props) {
  return (
    <PanelCard tone="yellow">
      <SectionHeader
        title="Up Next"
        className="mb-3.5"
        actions={<CircleButton size={28}><RefreshCw className="size-3.5" /></CircleButton>}
      />
      <div className="mb-3.5 rounded-xl bg-white/60 px-3.5 py-2 text-xs font-semibold text-ish-ink-soft">
        Sequence: Diwali Tasting → Close
      </div>
      {tasks.map((task) => (
        <TaskCard key={task.title} task={task} />
      ))}
    </PanelCard>
  );
}
