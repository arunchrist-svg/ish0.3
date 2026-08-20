import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import {
  IMPORT_TARGET_FIELDS,
  MULTI_MAP_FIELDS,
  importMappedLeads,
  mappingHasRequiredFields,
  parseLeadImportFile,
  type ColumnMapping,
  type ImportTargetField,
} from "@/lib/leads/import";

export const maxDuration = 300;

function isTargetField(value: unknown): value is ImportTargetField {
  return typeof value === "string" && (IMPORT_TARGET_FIELDS as readonly string[]).includes(value);
}

function allowsMultiple(field: ImportTargetField): boolean {
  return (MULTI_MAP_FIELDS as readonly string[]).includes(field);
}

function sanitizeMapping(raw: unknown, headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const used = new Set<ImportTargetField>();

  for (const header of headers) {
    const candidate = source[header];
    if (isTargetField(candidate) && (!used.has(candidate) || allowsMultiple(candidate))) {
      mapping[header] = candidate;
      used.add(candidate);
    } else {
      mapping[header] = null;
    }
  }
  return mapping;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);

    const contentType = req.headers.get("content-type") ?? "";
    let rows: Record<string, string>[] = [];
    let mapping: ColumnMapping = {};
    let enrich = true;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const mappingRaw = form.get("mapping");
      const enrichRaw = form.get("enrich");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "file required" }, { status: 400 });
      }
      if (typeof mappingRaw !== "string") {
        return NextResponse.json({ error: "mapping required" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parseLeadImportFile({ filename: file.name, buffer });
      rows = parsed.rows;
      mapping = sanitizeMapping(JSON.parse(mappingRaw), parsed.headers);
      enrich = enrichRaw !== "false";
    } else {
      const body = (await req.json()) as {
        rows?: Record<string, string>[];
        mapping?: ColumnMapping;
        enrich?: boolean;
      };

      if (!Array.isArray(body.rows) || !body.rows.length) {
        return NextResponse.json({ error: "rows required" }, { status: 400 });
      }
      if (!body.mapping || typeof body.mapping !== "object") {
        return NextResponse.json({ error: "mapping required" }, { status: 400 });
      }

      rows = body.rows;
      const headers = Object.keys(body.rows[0] ?? {});
      mapping = sanitizeMapping(body.mapping, headers);
      enrich = body.enrich !== false;
    }

    const required = mappingHasRequiredFields(mapping);
    if (!required.ok) {
      return NextResponse.json(
        { error: `Missing required mappings: ${required.missing.join(", ")}` },
        { status: 400 },
      );
    }

    const summary = await importMappedLeads({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      rawRows: rows,
      mapping,
      enrich,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return handleApiError(e, "[api/leads/import/confirm]");
  }
}
