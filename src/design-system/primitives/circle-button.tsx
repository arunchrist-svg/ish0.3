import { cn } from "@/lib/utils";
import { Button } from "@/design-system";

type CircleButtonProps = {
  children: React.ReactNode;
  size?: number;
  active?: boolean;
  className?: string;
  onClick?: () => void;
};

export function CircleButton({ children, size = 36, active, className, onClick }: CircleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full shadow-[var(--shadow-ish-sm)] hover:brightness-[0.97]",
        active ? "bg-ish-black text-white hover:bg-ish-black/90" : "bg-white text-ish-ink-soft hover:bg-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </Button>
  );
}
