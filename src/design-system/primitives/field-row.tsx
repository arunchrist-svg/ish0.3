import { Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type Props = {
  label: string;
  value: string;
  action?: "phone" | "mail";
};

export function FieldRow({ label, value, action }: Props) {
  return (
    <div className="mb-4">
      <div className={cn("mb-1", text.label)}>{label}</div>
      <div className="flex items-center justify-between">
        <div className={text.body}>{value}</div>
        {action === "phone" && <Phone className="size-3.5 text-ish-ink-faint" />}
        {action === "mail" && <Mail className="size-3.5 text-ish-ink-faint" />}
      </div>
    </div>
  );
}
