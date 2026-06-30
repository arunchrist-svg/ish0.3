"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem("ish-push-dismissed") === "1") return;
    setVisible(true);
  }, []);

  const enable = useCallback(async () => {
    setLoading(true);
    try {
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyData = await keyRes.json();
      if (!keyData.enabled || !keyData.publicKey) {
        toast.message("Push notifications are not configured yet");
        setVisible(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });

      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });

      toast.success("Notifications enabled");
      setVisible(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-4 mb-4 flex items-start gap-3 rounded-[20px] bg-white p-4 shadow-[var(--shadow-ish-sm)] ring-1 ring-ish-stratus-blue/20 lg:mx-8">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ish-green-soft">
        <Bell className="size-5 text-ish-stratus-blue" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-ish-ink">Get notified when AI finishes</div>
        <p className="mt-0.5 text-xs text-ish-ink-soft">Research complete, replies, and drafts ready for review.</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void enable()}
          className="mt-3 min-h-[40px] rounded-xl bg-ish-black px-4 text-[12px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "Enabling..." : "Enable notifications"}
        </button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem("ish-push-dismissed", "1");
          setVisible(false);
        }}
        className="shrink-0 rounded-full p-1 text-ish-ink-faint"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
