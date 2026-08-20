import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { aiMapColumns, applyColumnMapping, mappingHasRequiredFields, parseLeadImportFile } from "@/lib/leads/import";
import { INLINE_ENRICH_MAX, MAX_IMPORT_ROWS } from "@/lib/leads/import/types";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseLeadImportFile({ filename: file.name, buffer });

    if (!parsed.headers.length) {
      return NextResponse.json({ error: "No header row found in file" }, { status: 400 });
    }
    if (!parsed.rowCount) {
      return NextResponse.json({ error: "No data rows found in file" }, { status: 400 });
    }

    const mapping = await aiMapColumns({
      headers: parsed.headers,
      sampleRows: parsed.rows.slice(0, 5),
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    const required = mappingHasRequiredFields(mapping.mappings);
    const applied = applyColumnMapping(parsed.rows, mapping.mappings);
    const warnings: string[] = [];
    if (!required.ok) {
      warnings.push(`Required fields not mapped yet: ${required.missing.join(", ")}`);
    }
    if (applied.skipped.length) {
      warnings.push(
        `Skipping ${applied.skipped.length} row${applied.skipped.length === 1 ? "" : "s"} with no email. ${applied.rows.length} will load.`,
      );
    } else if (applied.rows.length) {
      warnings.push(`${applied.rows.length} row${applied.rows.length === 1 ? "" : "s"} have an email and will load.`);
    }
    if (applied.invalid.length) {
      warnings.push(
        `${applied.invalid.length} row${applied.invalid.length === 1 ? "" : "s"} are missing company and will fail.`,
      );
    }
    if (applied.rows.length > INLINE_ENRICH_MAX) {
      warnings.push(
        `Large import (${applied.rows.length} of ${parsed.rowCount} rows, max ${MAX_IMPORT_ROWS}). Leads load as uploaded.`,
      );
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      headers: parsed.headers,
      rowCount: parsed.rowCount,
      sampleRows: parsed.rows.slice(0, 5),
      // Echo all rows so confirm can reuse without re-upload ambiguity; capped by MAX_IMPORT_ROWS
      rows: parsed.rows,
      mapping: mapping.mappings,
      confidence: mapping.confidence,
      mappingSource: mapping.source,
      notes: mapping.notes,
      warnings,
      requiredOk: required.ok,
      missingRequired: required.missing,
      loadCount: applied.rows.length,
      skipCount: applied.skipped.length,
      failCount: applied.invalid.length,
    });
  } catch (e) {
    return handleApiError(e, "[api/leads/import/preview]");
  }
}
