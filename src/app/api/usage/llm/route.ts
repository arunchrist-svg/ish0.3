import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    await requireSuperadmin();
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const maxOutput = process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
      ? parseInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 10)
      : null;

    return NextResponse.json({
      provider: "anthropic",
      anthropic: {
        configured: Boolean(anthropicKey),
        active: true,
        haikuModel: process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5",
        sonnetModel: process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-6",
        maxOutputTokens: Number.isFinite(maxOutput) ? maxOutput : null,
      },
    });
  } catch (e) {
    return handleApiError(e, "[usage/llm]");
  }
}
