import { db } from "@/db";

const FALLBACK_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const FALLBACK_WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";

export async function getDefaultTenantContext(): Promise<{ tenantId: string; workspaceId: string }> {
  const tenant = await db.query.tenants.findFirst();
  if (tenant) {
    const workspace = await db.query.workspaces.findFirst({
      where: (w, { eq }) => eq(w.tenantId, tenant.id),
    });
    if (workspace) {
      return { tenantId: tenant.id, workspaceId: workspace.id };
    }
  }
  return { tenantId: FALLBACK_TENANT_ID, workspaceId: FALLBACK_WORKSPACE_ID };
}
