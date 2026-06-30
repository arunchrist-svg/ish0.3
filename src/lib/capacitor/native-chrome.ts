import { isNativePlatform } from "@/lib/capacitor/platform";

/** Stratus theme tokens — keep in sync with manifest.ts + tokens.css */
export const NATIVE_THEME = {
  canvas: "#f6f7fa",
  primary: "#83a2db",
  ink: "#0d0d0d",
} as const;

async function whenCapacitorReady(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  });
  await new Promise((r) => setTimeout(r, 50));
}

export async function applyNativeChrome(): Promise<void> {
  if (!isNativePlatform()) return;
  await whenCapacitorReady();

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable */
  }

  // Status bar colors are set in android/app styles.xml. The StatusBar plugin
  // can crash on some Android 15+ builds when invoked from the WebView bridge.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "ios") return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color: NATIVE_THEME.canvas });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* plugin unavailable */
  }
}
