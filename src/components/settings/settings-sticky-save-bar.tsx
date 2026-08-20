"use client";

import { cn } from "@/lib/utils";
import { Loader2, Save } from "lucide-react";

type Props = {
  visible: boolean;
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
  hint?: string;
};

export function SettingsStickySaveBar({
  visible,
  saving,
  disabled,
  onSave,
  hint = "Applies to your next Scout run",
}: Props) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "shrink-0 border-t px-4 py-3 backdrop-blur-xl sm:px-6",
        "border-[rgba(var(--brand-stratus-blue-rgb),0.18)]",
        "bg-[rgba(255,255,255,0.92)]",
        "shadow-[0_-4px_18px_rgba(var(--brand-stratus-blue-rgb),0.08)]",
      )}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <p className="hidden min-w-0 text-[12px] text-brand-ink-soft sm:block">{hint}</p>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          className={cn(
            "ml-auto flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold transition-all",
            !disabled && !saving
              ? "bg-brand-black text-white hover:opacity-90"
              : "cursor-not-allowed bg-brand-canvas text-brand-ink-faint",
          )}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
