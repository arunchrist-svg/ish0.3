import { config } from "dotenv";
import { vi } from "vitest";
import { sessionMock } from "./session-mock";

config({ path: ".env.local" });
config();

process.env.EMAIL_SEND_MODE = process.env.EMAIL_SEND_MODE ?? "dry_run";
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER ?? "gemini";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "ish_token" && sessionMock.token) {
        return { name, value: sessionMock.token };
      }
      return undefined;
    },
  })),
}));
