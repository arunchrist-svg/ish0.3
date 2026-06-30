import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-ish-canvas text-ish-ink-soft">
          {icon}
        </div>
      ) : null}
      <h3 className={text.cardTitle}>{title}</h3>
      {description ? <p className={cn("mt-2 max-w-xs", text.bodySoft)}>{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
