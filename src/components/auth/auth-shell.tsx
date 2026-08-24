import { AUTH_HERO_IMAGE, PRODUCT_NAME } from "@/components/auth/constants";

type AuthShellProps = {
  children: React.ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-brand-canvas font-sans">
      <img
        src={AUTH_HERO_IMAGE}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(var(--brand-stratus-yellow-rgb), 0.28) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 20%, rgba(var(--brand-stratus-blue-rgb), 0.22) 0%, transparent 52%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(var(--brand-stratus-salmon-rgb), 0.16) 0%, transparent 50%)",
        }}
        aria-hidden
      />

      <div className="relative flex h-full items-center justify-center px-4 py-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="w-full max-w-[380px] rounded-[22px] border border-brand-stratus-blue/18 bg-white/88 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9),0_8px_28px_rgba(var(--brand-stratus-blue-rgb),0.1)] backdrop-blur-xl sm:p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-stratus-blue text-[13px] font-extrabold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),0_4px_12px_rgba(var(--brand-stratus-blue-rgb),0.35)]">
              N
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-extrabold leading-none tracking-tight text-brand-ink">{PRODUCT_NAME}</p>
              <p className="mt-0.5 text-[11px] font-medium text-brand-ink-faint">Sales command center</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
