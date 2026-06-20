"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { CircleButton } from "@/design-system/primitives";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <CircleButton
      size={36}
      onClick={() => {
        const next = resolvedTheme === "dark" ? "light" : "dark";
        setTheme(next);
        toast.success(`Switched to ${next} mode`);
      }}
    >
      {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </CircleButton>
  );
}
