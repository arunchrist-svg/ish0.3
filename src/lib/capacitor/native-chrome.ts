import { isNativePlatform } from "@/lib/capacitor/platform";

/** Stratus theme tokens — keep in sync with manifest.ts + tokens.css */
export const NATIVE_THEME = {
  canvas: "#f6f7fa",
  primary: "#83a2db",
  ink: "#0d0d0d",
} as const;

export async function applyNativeChrome(): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color: NATIVE_THEME.canvas });
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* plugin unavailable */
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable */
  }
}
