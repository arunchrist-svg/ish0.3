"use client";

import { Plus, Upload } from "lucide-react";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  onAddLead: () => void;
  onLinkedIn: () => void;
  onUpload: () => void;
  disabled?: boolean;
  size?: number;
};

export function LeadAddMenu({ onAddLead, onLinkedIn, onUpload, disabled, size = 32 }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Add leads"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-white/80 text-brand-ink-soft shadow-[var(--shadow-brand-sm)] outline-none backdrop-blur-sm",
          "hover:text-brand-ink data-popup-open:bg-brand-stratus-blue data-popup-open:text-white",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        style={{ width: size, height: size }}
      >
        <Plus className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="min-w-[200px] rounded-2xl border border-brand-stratus-blue/20 bg-white/95 p-1.5 shadow-[var(--shadow-brand-float)] backdrop-blur-xl"
      >
        <DropdownMenuItem
          className="gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-brand-ink focus:bg-brand-stratus-blue/10"
          onClick={onAddLead}
        >
          <Plus className="size-3.5 text-brand-stratus-blue" />
          Add lead
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-brand-ink focus:bg-brand-stratus-blue/10"
          onClick={onLinkedIn}
        >
          <LinkedInGlyph className="size-3.5 text-brand-stratus-blue" />
          Add from LinkedIn
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-brand-ink focus:bg-brand-stratus-blue/10"
          onClick={onUpload}
        >
          <Upload className="size-3.5 text-brand-stratus-blue" />
          Upload spreadsheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
