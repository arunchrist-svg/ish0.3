import { randomUUID } from "crypto";
import { db, linkedinConnections, teamMembers } from "@/db";
import { eq } from "drizzle-orm";
import { parseConnectionsCsv, extractConnectionsCsvFromBuffer } from "./connections-parser";

export type ImportSummary = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  batchId: string;
};

export async function importConnectionsForMember(
  memberId: string,
  csvContent: string,
): Promise<ImportSummary> {
  const { rows, errors } = parseConnectionsCsv(csvContent);
  const batchId = randomUUID();
  let imported = 0;
  let updated = 0;
  const skipped = 0;

  for (const row of rows) {
    const existing = await db.query.linkedinConnections.findFirst({
      where: (c, { and, eq: e }) => and(e(c.memberId, memberId), e(c.linkedInUrl, row.linkedInUrl)),
    });

    if (existing) {
      await db
        .update(linkedinConnections)
        .set({
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email ?? null,
          company: row.company ?? null,
          position: row.position ?? null,
          connectedOn: row.connectedOn ?? null,
          importBatchId: batchId,
          updatedAt: new Date(),
        })
        .where(eq(linkedinConnections.id, existing.id));
      updated++;
    } else {
      await db.insert(linkedinConnections).values({
        memberId,
        firstName: row.firstName,
        lastName: row.lastName,
        linkedInUrl: row.linkedInUrl,
        email: row.email ?? null,
        company: row.company ?? null,
        position: row.position ?? null,
        connectedOn: row.connectedOn ?? null,
        importBatchId: batchId,
      });
      imported++;
    }
  }

  await db
    .update(teamMembers)
    .set({ lastImportAt: new Date(), updatedAt: new Date() })
    .where(eq(teamMembers.id, memberId));

  return { imported, updated, skipped, errors, batchId };
}

export async function importConnectionsFromFile(
  memberId: string,
  buffer: Buffer,
  filename: string,
): Promise<ImportSummary> {
  const csv = extractConnectionsCsvFromBuffer(buffer, filename);
  if (!csv) {
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: ["Upload Connections.csv from your LinkedIn data export"],
      batchId: "",
    };
  }
  return importConnectionsForMember(memberId, csv);
}
