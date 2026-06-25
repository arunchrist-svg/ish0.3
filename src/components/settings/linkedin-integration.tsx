"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Loader2, Upload } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StatusResponse = {
  configured: boolean;
  activeMember: {
    id: string;
    name: string;
    email: string | null;
    linkedInPicture: string | null;
    lastImportAt: string | null;
    connectionCount: number;
    stale: boolean;
  } | null;
  members: { id: string; name: string; email: string | null; lastImportAt: string | null }[];
};

export function LinkedInIntegration() {
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/status");
      setStatus(await res.json());
    } catch {
      toast.error("Could not load LinkedIn status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/linkedin/status")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load LinkedIn status");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const linkedin = searchParams.get("linkedin");
    if (linkedin === "connected") toast.success("LinkedIn account connected");
    if (linkedin === "error") toast.error("LinkedIn connection failed");
    if (linkedin === "invalid_state") toast.error("LinkedIn OAuth state mismatch — try again");
  }, [searchParams]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/linkedin/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported ${data.imported} new, updated ${data.updated} connections`);
      if (data.errors?.length) toast.warning(`${data.errors.length} row warnings`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ish-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading integration status…
      </div>
    );
  }

  const member = status?.activeMember;

  return (
    <>
      {!status?.configured && (
        <SettingsGroup title="LinkedIn OAuth">
          <p className="px-4 py-4 text-[13px] leading-relaxed text-ish-ink-soft">
            LinkedIn sign-in is not enabled yet. You can still import a Connections.csv export below once your account is linked by your workspace admin.
          </p>
        </SettingsGroup>
      )}

      <SettingsGroup
        title="LinkedIn Account"
        footer="Connect your profile to match your network against CRM contacts for warm-intro paths."
      >
        <SettingsRow className="items-start gap-4 py-4">
          {member?.linkedInPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.linkedInPicture} alt="" className="size-12 shrink-0 rounded-full" />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ish-canvas text-[18px] font-bold text-ish-ink-faint">
              in
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ish-ink">{member?.name ?? "No account linked"}</p>
            <p className="text-[13px] text-ish-ink-soft">{member?.email ?? "Connect to identify your rep profile"}</p>
            {member && (
              <p className="mt-1 text-[12px] text-ish-ink-faint">
                {member.connectionCount} connections
                {member.lastImportAt
                  ? ` · last import ${new Date(member.lastImportAt).toLocaleDateString()}`
                  : " · no import yet"}
              </p>
            )}
          </div>
          {status?.configured && (
            <a
              href="/api/auth/linkedin/authorize"
              className="shrink-0 rounded-full bg-[#0A66C2] px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90"
            >
              {member ? "Reconnect" : "Connect"}
            </a>
          )}
        </SettingsRow>

        {member?.stale && (
          <>
            <SettingsGroupDivider />
            <div className="flex items-start gap-2 px-4 py-3 text-[12px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Export is over 30 days old. Re-import Connections.csv for up-to-date paths.
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Import Connections"
        footer="Export from LinkedIn: Me → Settings & Privacy → Data privacy → Get a copy of your data → Connections."
      >
        <SettingsRow
          onClick={() => window.open("https://www.linkedin.com/help/linkedin/answer/a566336", "_blank")}
          className="justify-between"
        >
          <span className="text-[15px] font-medium text-ish-stratus-blue">Export instructions</span>
          <ExternalLink className="size-4 text-ish-ink-faint" />
        </SettingsRow>

        <SettingsGroupDivider />

        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />

        <div className="px-4 py-3">
          <button
            type="button"
            disabled={!member || uploading}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
              member && !uploading
                ? "bg-ish-black text-white hover:opacity-90"
                : "cursor-not-allowed bg-ish-canvas text-ish-ink-faint",
            )}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "Importing…" : "Upload Connections.csv"}
          </button>
        </div>

        {member?.connectionCount ? (
          <>
            <SettingsGroupDivider />
            <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-ish-stratus-blue">
              <Check className="size-4" /> {member.connectionCount} connections loaded for matching
            </p>
          </>
        ) : null}
      </SettingsGroup>

      {status && status.members.length > 1 && (
        <SettingsGroup title="Team Members" footer="All LinkedIn-connected reps in this workspace.">
          {status.members.map((m, i) => (
            <div key={m.id}>
              {i > 0 ? <SettingsGroupDivider /> : null}
              <div className="px-4 py-3">
                <p className="text-[15px] font-medium text-ish-ink">{m.name}</p>
                {m.lastImportAt && (
                  <p className="text-[12px] text-ish-ink-faint">
                    Imported {new Date(m.lastImportAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </SettingsGroup>
      )}
    </>
  );
}
