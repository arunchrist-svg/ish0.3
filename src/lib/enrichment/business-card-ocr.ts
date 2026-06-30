import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const BusinessCardSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedIn: z.string().optional(),
});

export type BusinessCardFields = z.infer<typeof BusinessCardSchema>;

export async function extractBusinessCardFromImage(imageBase64: string): Promise<BusinessCardFields> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new Error("Vision OCR is not configured (missing Gemini API key)");
  }

  const mime = imageBase64.startsWith("/9j/") ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mime};base64,${imageBase64.replace(/^data:image\/\w+;base64,/, "")}`;

  const model = google(process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash");
  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract contact fields from this business card image. Return ONLY valid JSON:
{"name":"","title":"","company":"","email":"","phone":"","linkedIn":""}
Use empty string for missing fields. Phone should include country code if visible.`,
          },
          { type: "image", image: dataUrl },
        ],
      },
    ],
    maxOutputTokens: 512,
  } as Parameters<typeof generateText>[0]);

  const raw = text?.trim() ?? "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  return BusinessCardSchema.parse(parsed);
}
