import { PRODUCT_NAME } from "@/lib/brand";

export function TopBar() {
  return (
    <div className="flex shrink-0 items-center border-b border-ish-border bg-white px-7 py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-[18px] font-extrabold tracking-tight text-ish-ink">{PRODUCT_NAME}</span>
        <span className="font-light text-ish-border">|</span>
        <span className="text-sm text-ish-ink-soft">Sales Hub</span>
      </div>
    </div>
  );
}
