"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Loader2, Upload } from "lucide-react";
import { SettingsSection } from "@/components/settings/settings-section";
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
    <div className="grid grid-cols-12 gap-4">
      <SettingsSection
        className="col-span-12"
        title="LinkedIn — Who Knows Whom"
        description="Connect your LinkedIn profile, then import Connections.csv from your LinkedIn data export. The app matches your network against CRM contacts to surface warm-intro paths."
      >
        {!status?.configured && (
          <div className="mb-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900">
            Add LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI to .env.local to enable OAuth.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 rounded-[16px] border border-ish-border/60 bg-white/70 p-4 backdrop-blur-sm">
          {member?.linkedInPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.linkedInPicture} alt="" className="size-12 rounded-full" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-ish-app text-[18px] font-bold text-ish-ink-faint">in</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-ish-ink">{member?.name ?? "No LinkedIn account linked"}</p>
            <p className="text-[12px] text-ish-ink-soft">{member?.email ?? "Connect to identify your rep profile"}</p>
            {member && (
              <p className="mt-1 text-[11px] text-ish-ink-faint">
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
              className="rounded-[12px] bg-[#0A66C2] px-4 py-2.5 text-[12px] font-bold text-white hover:opacity-90"
            >
              {member ? "Reconnect LinkedIn" : "Connect LinkedIn"}
            </a>
          )}
        </div>

        {member?.stale && (
          <div className="mt-3 flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Your connection export is over 30 days old. Re-import Connections.csv for up-to-date warm-intro paths.
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        className="col-span-12 lg:col-span-6"
        title="Import Connections"
        description="Export from LinkedIn: Me → Settings & Privacy → Data privacy → Get a copy of your data → Connections."
      >
        <a
          href="https://www.linkedin.com/help/linkedin/answer/a566336"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ish-stratus-blue hover:underline"
        >
          LinkedIn export instructions <ExternalLink className="size-3" />
        </a>

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

        <button
          type="button"
          disabled={!member || uploading}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex items-center gap-2 rounded-[14px] px-5 py-3 text-[13px] font-bold transition-all",
            member && !uploading
              ? "bg-ish-black text-white hover:opacity-90"
              : "cursor-not-allowed bg-ish-ink-faint/30 text-ish-ink-faint",
          )}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {uploading ? "Importing…" : "Upload Connections.csv"}
        </button>

        {!member && (
          <p className="mt-2 text-[11px] text-ish-ink-faint">Connect LinkedIn first, then upload your export.</p>
        )}

        {member?.connectionCount ? (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ish-stratus-blue">
            <Check className="size-3.5" /> {member.connectionCount} connections loaded for matching
          </p>
        ) : null}
      </SettingsSection>

      {status && status.members.length > 1 && (
        <SettingsSection className="col-span-12 lg:col-span-6" title="Team members" description="All LinkedIn-connected reps in this workspace.">
          <ul className="space-y-2">
            {status.members.map((m) => (
              <li key={m.id} className="rounded-[12px] border border-ish-border px-3 py-2 text-[12px] text-ish-ink-soft">
                <span className="font-semibold text-ish-ink">{m.name}</span>
                {m.lastImportAt && (
                  <span className="text-ish-ink-faint"> · imported {new Date(m.lastImportAt).toLocaleDateString()}</span>
                )}
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
