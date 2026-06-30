import { AUTH_HERO_IMAGE, PRODUCT_NAME } from "@/components/auth/constants";

type AuthShellProps = {
  children: React.ReactNode;
};

function StratusAmbient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-ish-stratus-blue/25 blur-3xl" />
      <div className="absolute -right-20 top-[28%] h-64 w-64 rounded-full bg-ish-stratus-salmon/20 blur-3xl" />
      <div className="absolute bottom-[-4rem] left-[18%] h-56 w-56 rounded-full bg-ish-stratus-yellow/25 blur-3xl" />
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-1.5 shrink-0 rounded-full bg-ish-stratus-gradient shadow-[0_0_12px_rgba(131,162,219,0.45)]" />
        <span className="text-[28px] font-extrabold tracking-tight text-ish-ink lg:text-[26px]">{PRODUCT_NAME}</span>
      </div>
      <p className="mt-1 pl-4 text-[12px] font-medium tracking-wide text-ish-ink-faint">Sales command center</p>
    </div>
  );
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="ish-ambient-canvas relative min-h-dvh overflow-hidden bg-ish-canvas font-sans lg:min-h-0 lg:bg-black lg:p-[15px]">
      <StratusAmbient />

      <div className="relative mx-auto flex min-h-dvh max-w-[1620px] flex-col lg:h-screen lg:min-h-0">
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),24px)] lg:max-w-none lg:px-0 lg:pb-0 lg:pt-0">
          <div className="mb-6 lg:hidden">
            <BrandMark />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-ish-border/50 bg-white/78 shadow-[var(--shadow-ish-float)] backdrop-blur-xl lg:flex-row lg:rounded-3xl lg:border-0 lg:bg-white lg:shadow-[var(--shadow-ish-float)] lg:backdrop-blur-none">
            <aside className="relative hidden w-[58%] overflow-hidden bg-black lg:block">
              <img
                src={AUTH_HERO_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-90"
                aria-hidden
              />
              <div className="absolute inset-0 bg-gradient-to-br from-ish-stratus-blue/40 via-transparent to-ish-stratus-salmon/30" />
              <div className="absolute bottom-10 left-10 right-10">
                <BrandMark className="text-white [&_p]:text-white/70 [&_span:last-child]:text-white" />
              </div>
            </aside>

            <main className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-8 sm:px-10 lg:items-center lg:px-16 lg:py-12 xl:px-20">
                <div className="w-full max-w-[400px]">
                  <div className="mb-8 hidden lg:block">
                    <BrandMark />
                  </div>
                  {children}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
