import { redirect } from "next/navigation";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await requireTenantContext();
    if (ctx.onboardingStatus === "complete") {
      redirect("/");
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw e;
  }

  return (
    <div className="ish-onboarding-shell ish-ambient-canvas relative min-h-screen overflow-x-hidden font-sans">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-stratus-blue/20 blur-3xl" />
        <div className="absolute -right-20 top-[22%] h-64 w-64 rounded-full bg-brand-stratus-salmon/15 blur-3xl" />
        <div className="absolute bottom-[-4rem] left-[20%] h-56 w-56 rounded-full bg-brand-stratus-yellow/20 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
