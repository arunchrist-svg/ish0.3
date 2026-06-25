import { AUTH_HERO_IMAGE, PRODUCT_NAME } from "@/components/auth/constants";

type AuthShellProps = {
  children: React.ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-black p-[15px] font-sans">
      <div className="mx-auto flex h-full max-w-[1620px] overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-ish-float)]">
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside className="relative hidden w-[58%] overflow-hidden bg-black lg:block">
            <img
              src={AUTH_HERO_IMAGE}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
          </aside>

          <main className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-12 sm:px-12 lg:px-16 xl:px-20">
              <div className="w-full max-w-[400px]">
                <div className="mb-10">
                  <span className="text-[26px] font-extrabold tracking-tight text-ish-ink">{PRODUCT_NAME}</span>
                </div>
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
