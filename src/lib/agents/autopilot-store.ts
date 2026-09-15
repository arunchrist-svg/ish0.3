import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  autopilotRuns,
  type AutopilotRunInput,
  type AutopilotRunProgress,
  type AutopilotRunStatus,
} from "@/db";

export type AutopilotRunRow = typeof autopilotRuns.$inferSelect;

const EMPTY_PROGRESS: AutopilotRunProgress = {
  chunkIndex: 0,
  companiesSaved: 0,
  leadsSaved: 0,
  leadIds: [],
  companyNames: [],
  skipped: [],
};

export async function createAutopilotRun(params: {
  tenantId: string;
  workspaceId: string;
  createdByUserId?: string;
  input: AutopilotRunInput;
}): Promise<AutopilotRunRow> {
  const [row] = await db
    .insert(autopilotRuns)
    .values({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      createdByUserId: params.createdByUserId,
      status: "queued",
      input: params.input,
      progress: EMPTY_PROGRESS,
    })
    .returning();
  if (!row) throw new Error("Could not create Autopilot run");
  return row;
}

export async function getAutopilotRun(runId: string): Promise<AutopilotRunRow | null> {
  const row = await db.query.autopilotRuns.findFirst({
    where: eq(autopilotRuns.id, runId),
  });
  return row ?? null;
}

export async function listAutopilotRuns(params: {
  tenantId: string;
  workspaceId: string;
  limit?: number;
}): Promise<AutopilotRunRow[]> {
  return db
    .select()
    .from(autopilotRuns)
    .where(and(eq(autopilotRuns.tenantId, params.tenantId), eq(autopilotRuns.workspaceId, params.workspaceId)))
    .orderBy(desc(autopilotRuns.createdAt))
    .limit(params.limit ?? 50);
}

export async function updateAutopilotRun(
  runId: string,
  patch: {
    status?: AutopilotRunStatus;
    input?: AutopilotRunInput;
    progress?: AutopilotRunProgress;
    error?: string | null;
    startedAt?: Date | null;
    pausedAt?: Date | null;
    completedAt?: Date | null;
  },
): Promise<AutopilotRunRow> {
  const values: Partial<typeof autopilotRuns.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.status) values.status = patch.status;
  if (patch.input) values.input = patch.input;
  if (patch.progress) values.progress = patch.progress;
  if (patch.error !== undefined) values.error = patch.error;
  if (patch.startedAt !== undefined) values.startedAt = patch.startedAt ?? undefined;
  if (patch.pausedAt !== undefined) values.pausedAt = patch.pausedAt ?? undefined;
  if (patch.completedAt !== undefined) values.completedAt = patch.completedAt ?? undefined;

  const [row] = await db.update(autopilotRuns).set(values).where(eq(autopilotRuns.id, runId)).returning();
  if (!row) throw new Error("Autopilot run not found");
  return row;
}

export async function pauseAutopilotRun(runId: string, error?: string): Promise<AutopilotRunRow> {
  return updateAutopilotRun(runId, {
    status: "paused",
    error: error ?? "Paused.",
    pausedAt: new Date(),
  });
}

export function serializeAutopilotRun(row: AutopilotRunRow) {
  return {
    id: row.id,
    status: row.status,
    input: row.input,
    progress: row.progress,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAutopilotRunsByIds(ids: string[]): Promise<AutopilotRunRow[]> {
  if (!ids.length) return [];
  return db.select().from(autopilotRuns).where(inArray(autopilotRuns.id, ids));
}

export async function deleteAutopilotRun(runId: string): Promise<boolean> {
  const deleted = await db.delete(autopilotRuns).where(eq(autopilotRuns.id, runId)).returning({ id: autopilotRuns.id });
  return deleted.length > 0;
}
