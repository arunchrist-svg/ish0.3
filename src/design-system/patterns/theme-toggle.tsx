"use client";

import { Palette, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { toast } from "sonner";
import { CircleButton } from "@/design-system/primitives";

const THEME_CYCLE: Record<string, string> = {
  light: "stratus",
  stratus: "light",
};

const THEME_LABELS: Record<string, string> = {
  light: "Light",
  dark: "Dark",
  stratus: "Stratus",
};

function ThemeIcon({ theme }: { theme: string }) {
  if (theme === "stratus") return <Palette className="size-4" />;
  return <Sun className="size-4" />;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const current = resolvedTheme ?? "light";
  const next = THEME_CYCLE[current] ?? "light";

  return (
    <CircleButton
      size={36}
      onClick={() => {
        setTheme(next);
        toast.success(`Switched to ${THEME_LABELS[next] ?? next} theme`);
      }}
    >
      <ThemeIcon theme={current} />
    </CircleButton>
  );
}
