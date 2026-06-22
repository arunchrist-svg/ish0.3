import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Canonical settings selection mark — navy filled circle with check. */
export function SettingsSelectedIndicator({ selected }: { selected: boolean }) {
  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
        selected ? "border-ish-black bg-ish-black text-white" : "border-ish-border bg-transparent",
      )}
      aria-hidden={!selected}
    >
      {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
    </div>
  );
}
