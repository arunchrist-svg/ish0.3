import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/tenant";
import { hasTavilyKeys } from "@/lib/enrichment/tavily-keys";
import { handleApiError } from "@/lib/api-errors";

function maskKey(envName: string): { name: string; configured: boolean } {
  const val = process.env[envName];
  return { name: envName, configured: Boolean(val?.trim()) };
}

export async function GET() {
  try {
    await requireSuperadmin();
    return NextResponse.json({
      note: "Platform keys are managed centrally. Values are never exposed — only configured/not configured.",
      llm: {
        provider: process.env.LLM_PROVIDER ?? "gemini",
        keys: [
          maskKey("GEMINI_API_KEY"),
          maskKey("GOOGLE_GENERATIVE_AI_API_KEY"),
          maskKey("ANTHROPIC_API_KEY"),
          maskKey("OPENROUTER_API_KEY"),
        ],
      },
      enrichment: {
        keys: [maskKey("APOLLO_API_KEY"), maskKey("HUNTER_API_KEY"), maskKey("GOOGLE_PLACES_API_KEY")],
        tavily: { configured: hasTavilyKeys() },
      },
      email: {
        platformResend: maskKey("RESEND_API_KEY"),
        note: "Per-tenant email (SMTP/Resend) is configured in each company's Settings → Email",
      },
      stripe: maskKey("STRIPE_SECRET_KEY"),
    });
  } catch (e) {
    return handleApiError(e, "[admin/keys]");
  }
}
