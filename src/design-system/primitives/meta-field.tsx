import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type MetaFieldProps = {
  label: string;
  value: React.ReactNode;
  className?: string;
};

export function MetaField({ label, value, className }: MetaFieldProps) {
  return (
    <div className={className}>
      <div className={cn("mb-0.5", text.metaLabel)}>{label}</div>
      <div className={text.metaValue}>{value}</div>
    </div>
  );
}
