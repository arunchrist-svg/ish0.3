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

function resolveServerUrl(): string | undefined {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return undefined;

  // Android emulator cannot reach host "localhost"; 10.0.2.2 is the host loopback.
  const androidDev =
    process.env.CAPACITOR_ANDROID === "1" ||
    process.env.CAPACITOR_TARGET === "android";
  if (androidDev && /localhost|127\.0\.0\.1/.test(appUrl)) {
    return appUrl.replace(/localhost|127\.0\.0\.1/g, "10.0.2.2");
  }

  return appUrl;
}

const serverUrl = resolveServerUrl();
const isHttp = serverUrl?.startsWith("http://") ?? false;

const config: CapacitorConfig = {
  appId: "com.ish.saleshub",
  appName: "ISH Sales Hub",
  webDir: "public",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: isHttp,
          androidScheme: isHttp ? "http" : "https",
        },
      }
    : {}),
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: false,
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
