import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { aiMapColumns, mappingHasRequiredFields, parseLeadImportFile } from "@/lib/leads/import";

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
    const warnings: string[] = [];
    if (!required.ok) {
      warnings.push(`Required fields not mapped yet: ${required.missing.join(", ")}`);
    }
    if (parsed.rowCount > 100) {
      warnings.push(`Large import (${parsed.rowCount} rows). Enrichment may take a few minutes.`);
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
    });
  } catch (e) {
    return handleApiError(e, "[api/leads/import/preview]");
  }
}
