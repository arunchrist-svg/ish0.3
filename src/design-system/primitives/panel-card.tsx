import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const panelCardVariants = cva("rounded-2xl p-4 lg:rounded-[20px] lg:p-5", {
  variants: {
    tone: {
      pink: "bg-ish-pink-soft",
      yellow: "bg-ish-yellow-soft",
      green: "bg-ish-green-soft",
      white: "bg-white",
    },
    compact: {
      true: "p-3 lg:p-4",
      false: "",
    },
  },
  defaultVariants: {
    tone: "white",
    compact: false,
  },
});

type PanelCardProps = React.ComponentProps<"div"> & VariantProps<typeof panelCardVariants>;

export function PanelCard({ tone, compact, className, ...props }: PanelCardProps) {
  return <div className={cn(panelCardVariants({ tone, compact }), className)} {...props} />;
}

export { panelCardVariants };
