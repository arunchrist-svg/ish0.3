"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { useSession } from "@/components/providers/session-provider";
import { toast } from "sonner";

type WhatsAppStatus = {
  connected: boolean;
  connectedAt?: string;
};

export function WhatsAppIntegration() {
  const { session, refresh } = useSession();
  const canManage = session?.permissions.canManageIntegrations === true;
  const [status, setStatus] = useState<WhatsAppStatus | null>(() =>
    session ? { connected: session.whatsappConnected === true } : null,
  );
  const [loading, setLoading] = useState(!session);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/whatsapp");
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Failed to load WhatsApp status");
        }
        const next = (await res.json()) as WhatsAppStatus;
        if (!cancelled) setStatus(next);
      } catch (e) {
        if (!cancelled) {
          // Session already carries whatsappConnected from /api/auth/me.
          setStatus({ connected: session?.whatsappConnected === true });
          console.warn("[whatsapp-integration]", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.whatsappConnected]);

  async function handleToggle(connected: boolean) {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update WhatsApp");
      setStatus(data.config);
      await refresh();
      toast.success(connected ? "WhatsApp connected" : "WhatsApp disconnected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update WhatsApp");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-8 text-brand-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    );
  }

  const connected = status?.connected === true;

  return (
    <SettingsGroup
      title="WhatsApp"
      footer="Opens WhatsApp with the lead’s mobile number and your draft. Messages leave from your WhatsApp app, not a Cloud API."
      className="mb-4"
    >
      <SettingsToggleRow
        label={connected ? "WhatsApp connected" : "Connect WhatsApp"}
        desc={
          connected
            ? "Sellers can generate a WhatsApp draft and open chat when the lead has a mobile number."
            : "Turn this on to message leads from the WhatsApp tab."
        }
        value={connected}
        onChange={(v) => {
          if (!canManage) {
            toast.error("Admin access required to change WhatsApp");
            return;
          }
          void handleToggle(v);
        }}
      />
    </SettingsGroup>
  );
}
