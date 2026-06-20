import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const panelCardVariants = cva("rounded-[20px] p-5", {
  variants: {
    tone: {
      pink: "bg-ish-pink-soft",
      yellow: "bg-ish-yellow-soft",
      green: "bg-ish-green-soft",
      white: "bg-white",
    },
  },
  defaultVariants: {
    tone: "white",
  },
});

type PanelCardProps = React.ComponentProps<"div"> & VariantProps<typeof panelCardVariants>;

export function PanelCard({ tone, className, ...props }: PanelCardProps) {
  return <div className={cn(panelCardVariants({ tone }), className)} {...props} />;
}

export { panelCardVariants };
