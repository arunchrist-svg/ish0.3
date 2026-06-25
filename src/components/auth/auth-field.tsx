import { cn } from "@/lib/utils";
import { text } from "@/design-system";

type AuthFieldProps = {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
};

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  minLength,
  inputMode,
  maxLength,
}: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={cn("mb-2.5 block", text.label)}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        inputMode={inputMode}
        maxLength={maxLength}
        className={cn(
          "w-full rounded-2xl border border-ish-border bg-ish-canvas px-5 py-4 text-[15px] font-medium text-ish-ink",
          "placeholder:text-ish-ink-faint focus:border-ish-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-ish-black/5",
        )}
      />
    </div>
  );
}
