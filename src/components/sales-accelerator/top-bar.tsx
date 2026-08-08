import { PRODUCT_NAME } from "@/lib/brand";

export function TopBar() {
  return (
    <div className="flex shrink-0 items-center border-b border-brand-border bg-white px-7 py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-[18px] font-extrabold tracking-tight text-brand-ink">{PRODUCT_NAME}</span>
        <span className="font-light text-brand-border">|</span>
        <span className="text-sm text-brand-ink-soft">Sales Hub</span>
      </div>
    </div>
  );
}
