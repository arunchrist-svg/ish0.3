import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { mapWithConcurrency } from "@/lib/async";
import type { RawGiftIntelPost } from "@/lib/gift-intel/types";

const OCR_CONCURRENCY = 3;

async function ocrImageUrl(imageUrl: string): Promise<string | undefined> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
    return undefined;
  }

  try {
    const model = google(process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-2.0-flash");
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all visible text from this image related to gifts, brands, or company names. Return plain text only.",
            },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
      maxOutputTokens: 512,
    } as Parameters<typeof generateText>[0]);
    return text?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function enrichPostsWithOcr(posts: RawGiftIntelPost[]): Promise<RawGiftIntelPost[]> {
  const withImages = posts.filter((p) => p.imageUrl);
  if (!withImages.length) return posts;

  const ocrResults = await mapWithConcurrency(withImages, OCR_CONCURRENCY, async (post) => {
    const ocrText = post.imageUrl ? await ocrImageUrl(post.imageUrl) : undefined;
    return { url: post.url, ocrText };
  });

  const ocrMap = new Map(ocrResults.map((r) => [r.url, r.ocrText]));

  return posts.map((p) => ({
    ...p,
    ocrText: ocrMap.get(p.url) ?? p.ocrText,
  }));
}
