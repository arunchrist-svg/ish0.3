import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

const inputClassName = cn(
  "w-full rounded-2xl border border-ish-border bg-ish-canvas px-4 py-3.5 text-[16px] font-medium text-ish-ink lg:py-3 lg:text-[15px]",
  "placeholder:text-ish-ink-faint",
  "focus:border-ish-stratus-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

type IshInputProps = React.ComponentProps<"input"> & {
  label?: string;
};

export function IshInput({ label, id, className, ...props }: IshInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className={cn("mb-2 block", text.label)}>
          {label}
        </label>
      ) : null}
      <input id={inputId} className={inputClassName} {...props} />
    </div>
  );
}

type IshTextareaProps = React.ComponentProps<"textarea"> & {
  label?: string;
};

export function IshTextarea({ label, id, className, ...props }: IshTextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className={cn("mb-2 block", text.label)}>
          {label}
        </label>
      ) : null}
      <textarea id={inputId} className={cn(inputClassName, "min-h-[120px] resize-y")} {...props} />
    </div>
  );
}

type IshSelectProps = React.ComponentProps<"select"> & {
  label?: string;
};

export function IshSelect({ label, id, className, children, ...props }: IshSelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className={cn("mb-2 block", text.label)}>
          {label}
        </label>
      ) : null}
      <select id={inputId} className={cn(inputClassName, "appearance-none")} {...props}>
        {children}
      </select>
    </div>
  );
}
