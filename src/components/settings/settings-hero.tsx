import { cn } from "@/lib/utils";

type SettingsHeroProps = {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  className?: string;
};

export function SettingsHero({ icon: Icon, title, subtitle, action, className }: SettingsHeroProps) {
  return (
    <header className={cn("settings-hero mb-8 overflow-hidden rounded-[22px] border border-ish-border/40 bg-ish-yellow-gradient p-6 shadow-[var(--shadow-ish-yellow-sm)]", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/70 shadow-[var(--shadow-ish-sm)] backdrop-blur-sm">
            <Icon className="size-5 text-ish-ink" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ish-ink">{title}</h1>
            <p className="mt-1 text-[14px] leading-snug text-ish-ink-soft">{subtitle}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="settings-hero-stripe mt-5 h-1 w-full rounded-full" aria-hidden />
    </header>
  );
}
