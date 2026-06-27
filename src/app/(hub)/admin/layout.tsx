import { redirect } from "next/navigation";
import { requireSuperadmin, UnauthorizedError, ForbiddenError } from "@/lib/tenant";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireSuperadmin();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  return children;
}
