import { redirect } from "next/navigation";
import { HubShell } from "@/components/sales-accelerator/hub-shell";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";
import { isSafeToExposeDbOutage, publicApiErrorMessage } from "@/lib/api-error-message";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await requireTenantContext();
    if (ctx.mustChangePassword) {
      redirect("/change-password");
    }
    if (ctx.onboardingStatus !== "complete") {
      redirect("/onboarding");
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      redirect("/login");
    }
    if (isSafeToExposeDbOutage(e)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-brand-canvas px-6">
          <div className="max-w-md space-y-3 text-center">
            <p className="text-[15px] font-semibold text-brand-ink">Can not load the app right now</p>
            <p className="text-[13px] leading-relaxed text-brand-ink-soft">{publicApiErrorMessage(e)}</p>
          </div>
        </div>
      );
    }
    throw e;
  }

  return <HubShell>{children}</HubShell>;
}
