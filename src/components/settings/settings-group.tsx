import { cn } from "@/lib/utils";

type SettingsGroupProps = {
  title?: string;
  footer?: string;
  children: React.ReactNode;
  className?: string;
};

/** Apple Settings–style grouped section: label above, rounded inset list below. */
export function SettingsGroup({ title, footer, children, className }: SettingsGroupProps) {
  return (
    <section className={cn("mb-7", className)}>
      {title ? (
        <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ish-ink-faint">
          {title}
        </h3>
      ) : null}
      <div className="settings-group overflow-hidden rounded-2xl border border-ish-border/40 bg-white/85 shadow-[0_1px_3px_rgba(20,20,30,0.04)] backdrop-blur-xl">
        {children}
      </div>
      {footer ? (
        <p className="mt-2.5 px-3 text-[12px] leading-relaxed text-ish-ink-faint">{footer}</p>
      ) : null}
    </section>
  );
}

export function SettingsGroupDivider() {
  return <div className="mx-4 h-px bg-ish-border/70" aria-hidden />;
}

type SettingsRowProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button";
};

export function SettingsRow({ children, className, onClick, as }: SettingsRowProps) {
  const Comp = as ?? (onClick ? "button" : "div");
  return (
    <Comp
      type={Comp === "button" ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors",
        onClick && "hover:bg-black/[0.025] active:bg-black/[0.04]",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
