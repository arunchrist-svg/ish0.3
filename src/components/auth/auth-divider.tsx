export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative py-2 text-center text-[12px] text-ish-ink-faint">
      <span className="relative z-10 bg-white px-2">{label}</span>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ish-border" aria-hidden />
    </div>
  );
}
