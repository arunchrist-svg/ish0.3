import { ISH_LOGO_URL } from "@/lib/brand";

export function TopBar() {
  return (
    <div className="flex shrink-0 items-center border-b border-ish-border bg-white px-7 py-4">
      <div className="flex items-center gap-2.5">
        <img src={ISH_LOGO_URL} alt="ISH" className="h-10 w-auto" />
        <span className="font-light text-ish-border">|</span>
        <span className="text-sm text-ish-ink-soft">Sales Hub</span>
      </div>
    </div>
  );
}
