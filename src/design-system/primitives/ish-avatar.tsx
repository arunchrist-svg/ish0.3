import { cn } from "@/lib/utils";
import { getAvatarColor } from "@/design-system/tokens";
import { getInitials } from "@/lib/data";

type IshAvatarProps = {
  name: string;
  index?: number;
  size?: number;
  className?: string;
};

export function IshAvatar({ name, index = 0, size = 40, className }: IshAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-[#5a4838] shadow-[var(--shadow-ish-sm)]",
        getAvatarColor(index),
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {getInitials(name)}
    </div>
  );
}
