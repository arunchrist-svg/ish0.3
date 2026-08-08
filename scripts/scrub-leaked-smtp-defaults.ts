/**
 * Clear platform/env SMTP bleed that was persisted into non-owner workspaces.
 *
 * Keeps credentials on the India Sweet House / Srilaksha workspace.
 * Clears smtp/from/reply-to/test fields when they match the shared mailbox
 * on any other tenant.
 *
 * Usage:
 *   npx tsx scripts/scrub-leaked-smtp-defaults.ts --dry-run
 *   npx tsx scripts/scrub-leaked-smtp-defaults.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const KEEP_WORKSPACE_ID = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";
const LEAKED_MARKERS = [
  "srilaksha.ish@gmail.com",
  "srilaksha@gmail.com",
].map((s) => s.toLowerCase());

const DRY_RUN = process.argv.includes("--dry-run");

function matchesLeak(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return LEAKED_MARKERS.includes(value.trim().toLowerCase());
}

async function main() {
  const { db, workspaceSettings, workspaces, tenants } = await import("../src/db");

  const rows = await db.select().from(workspaceSettings);
  const scrubbed = [];

  for (const row of rows) {
    if (row.workspaceId === KEEP_WORKSPACE_ID) continue;

    const ec = (row.emailConfig ?? {}) as Record<string, unknown>;
    const hit =
      matchesLeak(ec.smtpUser) ||
      matchesLeak(ec.fromAddress) ||
      matchesLeak(ec.replyToAddress) ||
      matchesLeak(ec.testRecipient);

    if (!hit) continue;

    const next = {
      ...ec,
      smtpUser: "",
      smtpPass: "",
      fromAddress: "",
      fromName: "",
      replyToAddress: "",
      replyToName: "",
      testRecipient: "",
      sendMode: ec.sendMode === "live" || ec.sendMode === "test" ? "dry_run" : ec.sendMode ?? "dry_run",
    };

    const [ws] = await db
      .select({ id: workspaces.id, name: workspaces.name, tenantId: workspaces.tenantId })
      .from(workspaces)
      .where(eq(workspaces.id, row.workspaceId))
      .limit(1);
    const [tenant] = ws
      ? await db
          .select({ slug: tenants.slug, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, ws.tenantId))
          .limit(1)
      : [undefined];

    if (!DRY_RUN) {
      await db
        .update(workspaceSettings)
        .set({ emailConfig: next, updatedAt: new Date() })
        .where(eq(workspaceSettings.workspaceId, row.workspaceId));
    }

    scrubbed.push({
      workspaceId: row.workspaceId,
      workspaceName: ws?.name,
      tenantSlug: tenant?.slug,
      before: {
        smtpUser: ec.smtpUser,
        fromAddress: ec.fromAddress,
        sendMode: ec.sendMode,
      },
      after: {
        smtpUser: next.smtpUser,
        fromAddress: next.fromAddress,
        sendMode: next.sendMode,
      },
    });
  }

  if (!DRY_RUN && scrubbed.length > 0) {
    invalidateEmailConfigCache();
  }

  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, scrubbedCount: scrubbed.length, scrubbed }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
