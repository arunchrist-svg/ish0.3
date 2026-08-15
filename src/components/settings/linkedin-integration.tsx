"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2, Upload } from "lucide-react";
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
    if (linkedin === "invalid_state") toast.error("LinkedIn OAuth state mismatch. Try again");
  }, [searchParams]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/linkedin/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported ${data.imported} new, updated ${data.updated}`);
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
      <div className="flex items-center justify-center py-12 text-brand-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    );
  }

  const member = status?.activeMember;

  return (
    <div className="pb-6">
      <SettingsGroup title="LinkedIn" className="mb-4">
        {!status?.configured ? (
          <p className="px-4 py-3 text-[12px] text-brand-ink-soft">
            OAuth is off. You can still upload a Connections.csv after an admin links the account.
          </p>
        ) : member ? (
          <SettingsRow className="justify-between py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-brand-ink">{member.name}</p>
              <p className="text-[11px] text-brand-ink-soft">
                {member.connectionCount.toLocaleString("en-IN")} connections
                {member.lastImportAt ? ` · ${new Date(member.lastImportAt).toLocaleDateString()}` : ""}
              </p>
            </div>
          </SettingsRow>
        ) : (
          <div className="px-4 py-3">
            <a
              href="/api/auth/linkedin/authorize"
              className="flex w-full items-center justify-center rounded-full bg-[#0A66C2] py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              Connect LinkedIn
            </a>
          </div>
        )}
        <SettingsGroupDivider />
        <SettingsRow
          onClick={() => window.open("https://www.linkedin.com/help/linkedin/answer/a566336", "_blank")}
          className="justify-between py-2.5"
        >
          <span className="text-[13px] font-medium text-brand-ink">Export guide</span>
          <ExternalLink className="size-3.5 text-brand-ink-faint" />
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
              "flex w-full items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold",
              member && !uploading
                ? "bg-brand-black text-white hover:opacity-90"
                : "cursor-not-allowed bg-brand-canvas text-brand-ink-faint",
            )}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {uploading ? "Importing…" : "Upload Connections.csv"}
          </button>
        </div>
      </SettingsGroup>
    </div>
  );
}
