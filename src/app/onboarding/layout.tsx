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

  return <div className="min-h-screen bg-ish-canvas">{children}</div>;
}
