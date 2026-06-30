import { config as loadEnv } from "dotenv";
import type { CapacitorConfig } from "@capacitor/cli";
import { existsSync } from "fs";
import { resolve } from "path";

const root = __dirname;

for (const file of [".env.local", ".env"]) {
  const path = resolve(root, file);
  if (existsSync(path)) {
    loadEnv({ path, override: false });
  }
}

/** Stratus canvas background — matches web manifest + tokens.css */
const STRATUS_CANVAS = "#f6f7fa";

const PRODUCTION_APP_URL = "https://ish0-3.vercel.app";

function resolveServerUrl(): string {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl?.startsWith("https://")) return appUrl;

  // Optional local dev: CAPACITOR_USE_LOCAL=1 with http://localhost:3002 in .env.local
  const useLocal = process.env.CAPACITOR_USE_LOCAL === "1";
  if (useLocal && appUrl) {
    const androidDev =
      process.env.CAPACITOR_ANDROID === "1" ||
      process.env.CAPACITOR_TARGET === "android";
    if (androidDev && /localhost|127\.0\.0\.1/.test(appUrl)) {
      return appUrl.replace(/localhost|127\.0\.0\.1/g, "10.0.2.2");
    }
    return appUrl;
  }

  // Default: Vercel production (phone works without this laptop running)
  return PRODUCTION_APP_URL;
}

const serverUrl = resolveServerUrl();
const isHttp = serverUrl?.startsWith("http://") ?? false;

const config: CapacitorConfig = {
  appId: "com.ish.saleshub",
  appName: "Nebula",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: isHttp,
    androidScheme: isHttp ? "http" : "https",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: STRATUS_CANVAS,
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: STRATUS_CANVAS,
    },
  },
};

export default config;
