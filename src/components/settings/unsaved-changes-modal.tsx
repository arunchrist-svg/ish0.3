"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";

type Props = {
  open: boolean;
  saving: boolean;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

export function UnsavedChangesModal({ open, saving, onStay, onDiscard, onSave }: Props) {
  return (
    <AppModal open={open} onClose={saving ? undefined : onStay} panelClassName="max-w-md">
      <div className="text-[16px] font-bold text-brand-ink">Unsaved changes</div>
      <p className="mt-2 text-[13px] leading-relaxed text-brand-ink-soft">
        You have unsaved settings. Save them before leaving, or discard and continue.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-brand-border/60 pt-4">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto rounded-full border border-brand-border px-4 py-2 text-[12px] font-semibold"
          onClick={onStay}
          disabled={saving}
        >
          Stay
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto rounded-full border border-brand-border px-4 py-2 text-[12px] font-semibold"
          onClick={onDiscard}
          disabled={saving}
        >
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto rounded-full bg-brand-black px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </AppModal>
  );
}
