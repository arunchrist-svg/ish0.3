import { cn } from "@/lib/utils";
import { Button } from "@/design-system";

type CircleButtonProps = {
  children: React.ReactNode;
  size?: number;
  active?: boolean;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
};

export function CircleButton({ children, size = 36, active, className, onClick, "aria-label": ariaLabel }: CircleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "shrink-0 rounded-full shadow-[var(--shadow-brand-sm)] hover:brightness-[0.97]",
        active ? "bg-brand-black text-white hover:bg-brand-black/90" : "bg-white text-brand-ink-soft hover:bg-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </Button>
  );
}
