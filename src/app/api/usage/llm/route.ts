import { NextResponse } from "next/server";

export async function GET() {
  const provider = process.env.LLM_PROVIDER ?? "gemini";

  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  return NextResponse.json({
    provider,
    gemini: {
      configured: Boolean(geminiKey),
      active: provider === "gemini",
      flashModel: process.env.GEMINI_MODEL_FLASH ?? "gemini-2.5-flash",
      flashLiteModel: process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash",
    },
    anthropic: {
      configured: Boolean(anthropicKey),
      active: provider === "anthropic",
      haikuModel: process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5",
      sonnetModel: process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-5",
      maxOutputTokens: process.env.ANTHROPIC_MAX_OUTPUT_TOKENS
        ? parseInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 10)
        : null,
    },
    openrouter: {
      configured: Boolean(openrouterKey),
      active: provider === "openrouter",
      fastModel: process.env.OPENROUTER_MODEL_FAST ?? "openai/gpt-4o-mini",
      qualityModel: process.env.OPENROUTER_MODEL_QUALITY ?? "openai/gpt-4o",
    },
  });
}
