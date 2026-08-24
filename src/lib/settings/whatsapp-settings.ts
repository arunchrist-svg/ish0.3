import { db, workspaceSettings } from "@/db";
import { eq } from "drizzle-orm";

export type WhatsAppConnection = {
  connected: boolean;
  connectedAt?: string;
};

type EnrichmentConfigBag = {
  whatsapp?: WhatsAppConnection;
  [key: string]: unknown;
};

function parseConnection(cfg: unknown): WhatsAppConnection {
  const raw = (cfg as EnrichmentConfigBag | null | undefined)?.whatsapp;
  return {
    connected: Boolean(raw?.connected),
    connectedAt: typeof raw?.connectedAt === "string" ? raw.connectedAt : undefined,
  };
}

export async function getWhatsAppConnection(workspaceId: string): Promise<WhatsAppConnection> {
  const [row] = await db
    .select({ enrichmentConfig: workspaceSettings.enrichmentConfig })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  return parseConnection(row?.enrichmentConfig);
}

export async function isWhatsAppConnected(workspaceId: string): Promise<boolean> {
  const conn = await getWhatsAppConnection(workspaceId);
  return conn.connected === true;
}

export async function setWhatsAppConnected(
  workspaceId: string,
  connected: boolean,
): Promise<WhatsAppConnection> {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  const prev = ((row?.enrichmentConfig ?? {}) as EnrichmentConfigBag) ?? {};
  const next: WhatsAppConnection = connected
    ? { connected: true, connectedAt: new Date().toISOString() }
    : { connected: false };
  const enrichmentConfig = { ...prev, whatsapp: next };

  if (row) {
    await db
      .update(workspaceSettings)
      .set({ enrichmentConfig, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceSettings).values({
      workspaceId,
      enrichmentConfig,
    });
  }

  return next;
}
