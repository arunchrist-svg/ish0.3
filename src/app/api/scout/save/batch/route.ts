import { requireTenantContext } from "@/lib/tenant";
import { saveScoutCompanies, saveScoutLeads, type SaveLeadsResult } from "@/lib/scout/save-leads";
import type { ScoutPersonResult, ScoutCompanyResult, DataMode } from "@/lib/enrichment/types";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { getResolvedWorkspaceEnrichmentConfig } from "@/lib/settings/workspace-settings";
import { mapWithConcurrency } from "@/lib/async";
import { handleApiError } from "@/lib/api-errors";

type BatchCompanyInput = {
  id: string;
  company: ScoutCompanyResult;
  people?: ScoutPersonResult[];
};

type BatchSaveRow = { id: string } & SaveLeadsResult & { error?: string };

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") === "1";
    const body = await req.json();
    const {
      companies,
      dataMode: requestedDataMode,
    }: {
      companies: BatchCompanyInput[];
      dataMode?: DataMode;
    } = body;

    if (!Array.isArray(companies) || companies.length === 0) {
      return Response.json({ error: "companies required" }, { status: 400 });
    }

    const named = companies.filter((entry) => entry.company?.name);
    const companyOnly = named.length > 0 && named.every((entry) => !(entry.people?.length));

    if (companyOnly) {
      const saved = await saveScoutCompanies({
        companies: named.map((entry) => entry.company),
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
      });
      const results: BatchSaveRow[] = companies.map((entry) => ({
        id: entry.id,
        saved: [],
        skipped: [],
        companySaved: Boolean(entry.company?.name),
        accountId: saved.accounts.find((account) => account.name === entry.company?.name)?.id,
      }));

      if (stream) {
        const encoder = new TextEncoder();
        const bodyStream = results
          .map((result) => `${JSON.stringify(result)}\n`)
          .join("");
        return new Response(encoder.encode(bodyStream), {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
          },
        });
      }

      return Response.json({ results, saved: saved.saved });
    }

    const dataMode = (requestedDataMode ?? process.env.DEFAULT_DATA_MODE ?? "free") as DataMode;
    const enrichmentConfig = await getResolvedWorkspaceEnrichmentConfig({ dataMode });
    const concurrency = Math.min(
      parseInt(process.env.SCOUT_SAVE_CONCURRENCY ?? "8", 10) || 8,
      10,
    );

    const saveOne = async (entry: BatchCompanyInput): Promise<BatchSaveRow> => {
      if (!entry.company?.name) {
        return { id: entry.id, saved: [], skipped: [] };
      }
      const result = await saveScoutLeads({
        people: entry.people ?? [],
        company: entry.company,
        dataMode,
        enrichmentConfig,
        leadSource: "scout_wizard",
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
      });
      return { id: entry.id, ...result };
    };

    if (stream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      void mapWithConcurrency(companies, concurrency, async (entry) => {
        try {
          const result = await saveOne(entry);
          await writer.write(encoder.encode(`${JSON.stringify(result)}\n`));
        } catch (e) {
          console.error("[api/scout/save/batch:stream]", entry.id, e);
          await writer.write(
            encoder.encode(
              `${JSON.stringify({
                id: entry.id,
                saved: [],
                skipped: [],
                error: e instanceof Error ? e.message : "Save failed",
              })}\n`,
            ),
          );
        }
      })
        .then(async () => {
          await writer.close();
        })
        .catch(async (e) => {
          console.error("[api/scout/save/batch:stream]", e);
          await writer.abort(e);
        });

      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const results = await mapWithConcurrency(companies, concurrency, saveOne);
    return Response.json({ results });
  } catch (e) {
    const err = handleApiError(e, "[api/scout/save/batch]");
    if (err.status !== 500) return err;
    return Response.json({ error: "Batch save failed" }, { status: 500 });
  }
}
