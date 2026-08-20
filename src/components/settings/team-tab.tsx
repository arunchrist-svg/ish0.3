"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, UserPlus } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { cn } from "@/lib/utils";
import { SMTP_SERVER_OPTIONS, type SmtpServerId } from "@/lib/email/config";
import { toast } from "sonner";

type Member = { id: string; name: string; email: string; role: string; status?: string; linkedIn?: string | null };
type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLES = ["admin", "member", "viewer"] as const;

const inputClass =
  "ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12";

export function TeamTab() {
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [linkedIn, setLinkedIn] = useState("");
  const [memberLinkedIn, setMemberLinkedIn] = useState<Record<string, string>>({});
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");
  const [mailHost, setMailHost] = useState<SmtpServerId>("zoho_in");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [lastTempPassword, setLastTempPassword] = useState("");

  async function load() {
    setLoading(true);
    const [mRes, iRes] = await Promise.all([fetch("/api/team/members"), fetch("/api/team/invites")]);
    if (mRes.ok) {
      const next = ((await mRes.json()).members ?? []) as Member[];
      setMembers(next);
      setMemberLinkedIn(Object.fromEntries(next.map((m) => [m.id, m.linkedIn ?? ""])));
    }
    if (iRes.ok) setInvites((await iRes.json()).invites ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/team/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role, linkedIn: linkedIn.trim() || undefined }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Create failed");
      return;
    }
    setLastTempPassword(data.tempPassword ?? "");
    setEmail("");
    setName("");
    setLinkedIn("");
    toast.success("User created");
    void load();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, mailHost, sendEmail: true }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Invite failed");
      return;
    }
    setLastInviteUrl(data.inviteUrl);
    setEmail("");
    if (data.emailed && !data.emailDryRun) {
      toast.success("Invite emailed with inbox setup steps");
    } else if (data.emailDryRun) {
      toast.success("Invite created. Mail was logged (no RESEND send). Copy the link below.");
    } else if (data.emailError) {
      toast.error(`Invite created, but email failed: ${data.emailError}. Copy the link below.`);
    } else {
      toast.success("Invite created");
    }
    void load();
  }

  async function saveMemberLinkedIn(memberId: string) {
    const value = memberLinkedIn[memberId] ?? "";
    const current = members.find((m) => m.id === memberId)?.linkedIn ?? "";
    if (value.trim() === (current ?? "").trim()) return;
    const res = await fetch(`/api/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedIn: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Could not save LinkedIn");
      return;
    }
    toast.success("LinkedIn saved");
    void load();
  }

  async function updateMemberRole(memberId: string, newRole: string) {
    const res = await fetch(`/api/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Update failed");
      return;
    }
    void load();
  }

  async function removeMember(memberId: string) {
    if (!window.confirm("Remove this member?")) return;
    const res = await fetch(`/api/team/members/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Remove failed");
      return;
    }
    void load();
  }

  async function revokeInvite(inviteId: string) {
    const res = await fetch(`/api/team/invites/${inviteId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke invite");
      return;
    }
    void load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-brand-ink-soft" />
      </div>
    );
  }

  return (
    <div className="pb-6">
      <SettingsGroup title="Add teammate" className="mb-4">
        <SettingsRow className="justify-between py-2.5">
          <span className="text-[13px] font-semibold text-brand-ink">Method</span>
          <SettingsSegmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "create", label: "Create" },
              { value: "invite", label: "Email invite" },
            ]}
          />
        </SettingsRow>
        <SettingsGroupDivider />
        <form onSubmit={mode === "create" ? handleCreate : handleInvite} className="grid gap-2.5 px-4 py-3 sm:grid-cols-[1fr_auto]">
          {mode === "create" ? (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className={inputClass} />
          ) : null}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" required className={cn(inputClass, mode === "invite" && "sm:col-span-1")} />
          {mode === "create" ? (
            <input type="url" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} placeholder="linkedin.com/in/…" className={cn(inputClass, "sm:col-span-2")} />
          ) : null}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              className="rounded-full border border-brand-stratus-blue/25 bg-white/80 px-3 py-1.5 text-[12px] font-semibold capitalize text-brand-ink"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {mode === "invite" ? (
              <select
                value={mailHost}
                onChange={(e) => setMailHost(e.target.value as SmtpServerId)}
                className="rounded-full border border-brand-stratus-blue/25 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-brand-ink"
                aria-label="Inbox they will send from"
              >
                {SMTP_SERVER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} setup
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-black px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              <UserPlus className="size-3.5" />
              {submitting ? "Working…" : mode === "create" ? "Create" : "Invite by email"}
            </button>
          </div>
          {mode === "invite" ? (
            <p className="text-[11px] leading-relaxed text-brand-ink-soft sm:col-span-2">
              We email a join link plus full {SMTP_SERVER_OPTIONS.find((o) => o.value === mailHost)?.label} setup steps
              (App Password, host, verify, test, then live).
            </p>
          ) : null}
          {lastTempPassword ? (
            <div className="rounded-xl bg-brand-yellow-soft/70 px-3 py-2 text-[12px] text-brand-ink sm:col-span-2">
              Temp password: <span className="font-mono font-bold">{lastTempPassword}</span>
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => {
                  void navigator.clipboard.writeText(lastTempPassword);
                  toast.success("Copied");
                }}
              >
                Copy
              </button>
            </div>
          ) : null}
          {lastInviteUrl ? (
            <div className="flex items-center gap-2 rounded-xl bg-brand-canvas/80 px-3 py-2 text-[11px] sm:col-span-2">
              <span className="min-w-0 flex-1 truncate font-mono text-brand-ink-soft">{lastInviteUrl}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(lastInviteUrl);
                  toast.success("Copied");
                }}
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-ink"
              >
                <Copy className="size-3.5" /> Copy
              </button>
            </div>
          ) : null}
        </form>
      </SettingsGroup>

      <SettingsGroup title={`Members · ${members.length}`} className="mb-4">
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 ? <SettingsGroupDivider /> : null}
            <SettingsRow className="justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-brand-ink">{m.name}</p>
                <p className="truncate text-[11px] text-brand-ink-soft">{m.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="url"
                    value={memberLinkedIn[m.id] ?? ""}
                    onChange={(e) => setMemberLinkedIn((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    onBlur={() => void saveMemberLinkedIn(m.id)}
                    placeholder="LinkedIn URL"
                    className={cn(inputClass, "py-1.5 text-[12px]")}
                  />
                  {m.linkedIn ? (
                    <a href={m.linkedIn} target="_blank" rel="noreferrer" className="shrink-0 text-brand-stratus-blue" aria-label={`Open ${m.name} on LinkedIn`}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.role !== "owner" ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => updateMemberRole(m.id, e.target.value)}
                      className="rounded-full border border-brand-stratus-blue/20 bg-white/80 px-2 py-1 text-[11px] capitalize"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeMember(m.id)} className="text-[11px] font-semibold text-brand-stratus-salmon">
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="rounded-full bg-brand-stratus-blue/15 px-2 py-0.5 text-[10px] font-semibold capitalize text-brand-ink">
                    owner
                  </span>
                )}
              </div>
            </SettingsRow>
          </div>
        ))}
      </SettingsGroup>

      {invites.length > 0 ? (
        <SettingsGroup title="Pending" className="mb-4">
          {invites.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 ? <SettingsGroupDivider /> : null}
              <SettingsRow className="justify-between py-2.5">
                <span className="text-[13px] font-medium text-brand-ink">{inv.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] capitalize text-brand-ink-faint">{inv.role}</span>
                  <button type="button" onClick={() => revokeInvite(inv.id)} className="text-[11px] font-semibold text-brand-stratus-salmon">
                    Revoke
                  </button>
                </div>
              </SettingsRow>
            </div>
          ))}
        </SettingsGroup>
      ) : null}
    </div>
  );
}
