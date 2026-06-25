import { redirect } from "next/navigation";
import { HubShell } from "@/components/sales-accelerator/hub-shell";
import { requireTenantContext, UnauthorizedError } from "@/lib/tenant";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await requireTenantContext();
    if (ctx.onboardingStatus !== "complete") {
      redirect("/onboarding");
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw e;
  }

  return <HubShell>{children}</HubShell>;
}
