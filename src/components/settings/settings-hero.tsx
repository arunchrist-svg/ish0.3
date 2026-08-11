import { cn } from "@/lib/utils";

type SettingsHeroProps = {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
};

export function SettingsHero({ icon: Icon, title, subtitle, action, className, compact }: SettingsHeroProps) {
  return (
    <header
      className={cn(
        "settings-hero overflow-hidden rounded-[22px] border border-brand-border/40 bg-brand-yellow-gradient shadow-[var(--shadow-brand-yellow-sm)]",
        compact ? "mb-3 rounded-[16px] px-3.5 py-2.5" : "mb-8 p-6",
        className,
      )}
    >
      <div className={cn("flex justify-between gap-3", compact ? "items-center" : "items-start gap-4")}>
        <div className={cn("flex min-w-0", compact ? "items-center gap-2.5" : "items-start gap-4")}>
          <div
            className={cn(
              "flex shrink-0 items-center justify-center bg-white/70 shadow-[var(--shadow-brand-sm)] backdrop-blur-sm",
              compact ? "size-8 rounded-xl" : "size-11 rounded-2xl",
            )}
          >
            <Icon className={cn(compact ? "size-4" : "size-5", "text-brand-ink")} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1
              className={cn(
                "font-bold leading-tight tracking-tight text-brand-ink",
                compact ? "text-[16px]" : "text-[28px]",
              )}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className={cn("text-brand-ink-soft", compact ? "mt-0 text-[12px] leading-snug" : "mt-1 text-[14px] leading-snug")}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="min-w-0 shrink">{action}</div> : null}
      </div>
      {compact ? null : <div className="settings-hero-stripe mt-5 h-1 w-full rounded-full" aria-hidden />}
    </header>
  );
}
