"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/capacitor/platform";

export function CapacitorPushSetup() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token) => {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              endpoint: `capacitor://${token.value}`,
              keys: { p256dh: "native", auth: "native" },
            }),
          }).catch(() => {});
        });
      } catch {
        /* native push optional */
      }
    })();
  }, []);

  return null;
}
