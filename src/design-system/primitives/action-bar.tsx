import { cn } from "@/lib/utils";
import { space } from "@/design-system/tokens";

type ActionBarProps = {
  children: React.ReactNode;
  className?: string;
};

export function ActionBar({ children, className }: ActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 border-t border-ish-border/60 bg-white/95 px-4 py-3 backdrop-blur-xl",
        "lg:static lg:bottom-auto lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none",
        className,
      )}
    >
      <div className={cn("mx-auto flex max-w-lg gap-2 lg:max-w-none", space.stack)}>{children}</div>
    </div>
  );
}
