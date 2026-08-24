"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { inboxSetupGuide } from "@/lib/email/inbox-setup-guide";
import type { SmtpServerId } from "@/lib/email/config";
import { cn } from "@/lib/utils";
import { CircleHelp } from "lucide-react";

export function InboxSetupSteps({ mailHost }: { mailHost: SmtpServerId }) {
  const guide = inboxSetupGuide(mailHost);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Set up ${guide.label} (${guide.host})`}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-brand-ink-faint",
          "transition-colors hover:bg-brand-canvas hover:text-brand-ink",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-stratus-blue/30",
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-[min(22rem,calc(100vw-2rem))] min-w-[18rem] max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl border border-brand-stratus-blue/25 bg-white/95 p-3 shadow-[var(--shadow-brand)] backdrop-blur-md"
      >
        <p className="text-[12px] font-semibold text-brand-ink">
          Set up {guide.label} ({guide.host})
        </p>
        <ol className="mt-2 space-y-2">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="text-[12px] leading-relaxed text-brand-ink-soft">
              <span className="font-semibold text-brand-ink">
                {i + 1}. {step.title}.
              </span>{" "}
              {step.detail}
            </li>
          ))}
        </ol>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
