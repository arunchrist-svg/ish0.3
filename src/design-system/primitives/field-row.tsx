import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type Props = {
  label: string;
  value: string;
  action?: "phone" | "mail";
  className?: string;
  /** Hide the row below lg when value is empty or em dash */
  hideWhenEmptyOnMobile?: boolean;
  /** Compact label-over-value in grid cells on mobile (e.g. two-column pairs) */
  compactStackedOnMobile?: boolean;
};

function isEmptyValue(value: string) {
  return !value || value === "—";
}

export function FieldRow({
  label,
  value,
  action,
  className,
  hideWhenEmptyOnMobile,
  compactStackedOnMobile,
}: Props) {
  const empty = isEmptyValue(value);
  const showAction = Boolean(action && !empty);

  return (
    <div
      className={cn(
        "mb-2 lg:mb-4",
        hideWhenEmptyOnMobile && empty && "hidden lg:block",
        className,
      )}
    >
      {/* Mobile: compact stacked for grid pairs */}
      {compactStackedOnMobile ? (
        <div className="lg:hidden">
          <div className={cn(text.label, "mb-0.5")}>{label}</div>
          <div className={cn(text.body, "truncate")}>{value}</div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className={cn(text.label, "shrink-0")}>{label}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <div className={cn(text.body, "truncate text-right")}>{value}</div>
            {showAction && action === "phone" ? (
              <Phone className="size-3 shrink-0 text-ish-ink-faint" aria-hidden />
            ) : null}
            {showAction && action === "mail" ? (
              <Mail className="size-3 shrink-0 text-ish-ink-faint" aria-hidden />
            ) : null}
          </div>
        </div>
      )}

      {/* Desktop: stacked label above value */}
      <div className="hidden lg:block">
        <div className={cn("mb-1", text.label)}>{label}</div>
        <div className="flex items-center justify-between">
          <div className={text.body}>{value}</div>
          {showAction && action === "phone" ? <Phone className="size-3.5 text-ish-ink-faint" /> : null}
          {showAction && action === "mail" ? <Mail className="size-3.5 text-ish-ink-faint" /> : null}
        </div>
      </div>
    </div>
  );
}
