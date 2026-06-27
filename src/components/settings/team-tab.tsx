"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Member = { id: string; name: string; email: string; role: string; status?: string };
type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLES = ["admin", "member", "viewer"] as const;

export function TeamTab() {
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [lastTempPassword, setLastTempPassword] = useState("");

  async function load() {
    setLoading(true);
    const [mRes, iRes] = await Promise.all([fetch("/api/team/members"), fetch("/api/team/invites")]);
    if (mRes.ok) setMembers((await mRes.json()).members ?? []);
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
      body: JSON.stringify({ email, name, role }),
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
    toast.success("User created");
    void load();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Invite failed");
      return;
    }
    setLastInviteUrl(data.inviteUrl);
    setEmail("");
    toast.success("Invite created");
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-ish-ink-soft" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-4 flex gap-2 px-1">
        <button type="button" onClick={() => setMode("create")} className={cn("rounded-full px-4 py-1.5 text-[12px] font-semibold", mode === "create" ? "bg-ish-black text-white" : "bg-ish-app text-ish-ink-soft")}>Create user</button>
        <button type="button" onClick={() => setMode("invite")} className={cn("rounded-full px-4 py-1.5 text-[12px] font-semibold", mode === "invite" ? "bg-ish-black text-white" : "bg-ish-app text-ish-ink-soft")}>Invite link</button>
      </div>

      <SettingsGroup title={mode === "create" ? "Create User" : "Invite Teammate"} footer={mode === "create" ? "Share the temporary password with the user. They must change it on first login." : "Copy the link and send it. They sign up and join your workspace."}>
        <form onSubmit={mode === "create" ? handleCreate : handleInvite} className="px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ish-ink">
            <UserPlus className="size-4 text-ish-stratus-blue" /> {mode === "create" ? "Direct create" : "Invite by email"}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {mode === "create" ? (
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className="flex-1 min-w-[140px] rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] outline-none focus:border-ish-stratus-blue/50" />
            ) : null}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" required className="flex-1 min-w-[180px] rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] outline-none focus:border-ish-stratus-blue/50" />
            <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])} className="rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] outline-none">
              {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
            <button type="submit" disabled={submitting} className={cn("rounded-full bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white", submitting && "opacity-60")}>
              {submitting ? "Working…" : mode === "create" ? "Create" : "Invite"}
            </button>
          </div>
          {lastTempPassword ? (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
              Temporary password: <span className="font-mono font-bold">{lastTempPassword}</span>
              <button type="button" className="ml-2 underline" onClick={() => { void navigator.clipboard.writeText(lastTempPassword); toast.success("Copied"); }}>Copy</button>
            </div>
          ) : null}
          {lastInviteUrl ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-ish-app/80 px-3 py-2.5 text-[11px]">
              <Mail className="size-4 shrink-0 text-ish-stratus-blue" />
              <span className="flex-1 truncate font-mono text-ish-ink-soft">{lastInviteUrl}</span>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(lastInviteUrl); toast.success("Copied"); }} className="flex shrink-0 items-center gap-1 font-semibold text-ish-ink hover:underline"><Copy className="size-3.5" /> Copy</button>
            </div>
          ) : null}
        </form>
      </SettingsGroup>

      <SettingsGroup title={`Members (${members.length})`}>
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && <SettingsGroupDivider />}
            <SettingsRow className="justify-between gap-3">
              <div>
                <p className="text-[14px] font-medium text-ish-ink">{m.name}</p>
                <p className="text-[12px] text-ish-ink-soft">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {m.role !== "owner" ? (
                  <>
                    <select value={m.role} onChange={(e) => updateMemberRole(m.id, e.target.value)} className="rounded-lg border px-2 py-1 text-[11px] capitalize">
                      {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                    <button type="button" onClick={() => removeMember(m.id)} className="text-[11px] text-red-600 hover:underline">Remove</button>
                  </>
                ) : (
                  <span className="rounded-full bg-ish-stratus-blue/15 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-ish-ink">owner</span>
                )}
              </div>
            </SettingsRow>
          </div>
        ))}
      </SettingsGroup>

      {invites.length > 0 && (
        <SettingsGroup title="Pending Invites">
          {invites.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 && <SettingsGroupDivider />}
              <SettingsRow className="justify-between">
                <span className="text-[14px] font-medium text-ish-ink">{inv.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] capitalize text-ish-ink-faint">{inv.role}</span>
                  <button type="button" onClick={() => revokeInvite(inv.id)} className="text-[11px] text-red-600 hover:underline">Revoke</button>
                </div>
              </SettingsRow>
            </div>
          ))}
        </SettingsGroup>
      )}
    </div>
  );
}
