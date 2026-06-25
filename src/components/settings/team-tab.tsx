"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Member = { id: string; name: string; email: string; role: string };
type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLES = ["admin", "member", "viewer"] as const;

export function TeamTab() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("member");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");

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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();
    setInviting(false);
    if (!res.ok) {
      toast.error(data.error ?? "Invite failed");
      return;
    }
    setLastInviteUrl(data.inviteUrl);
    setEmail("");
    toast.success("Invite created — copy the link below");
    void load();
  }

  function copyLink() {
    if (!lastInviteUrl) return;
    void navigator.clipboard.writeText(lastInviteUrl);
    toast.success("Invite link copied");
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
      <SettingsGroup title="Invite Teammate" footer="Copy the link and send it — they sign up and join your workspace.">
        <form onSubmit={handleInvite} className="px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ish-ink">
            <UserPlus className="size-4 text-ish-stratus-blue" /> Invite by email
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              className="flex-1 rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] shadow-[var(--shadow-ish-sm)] outline-none transition-all focus:border-ish-stratus-blue/50 focus:ring-2 focus:ring-ish-stratus-blue/20"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              className="rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] shadow-[var(--shadow-ish-sm)] outline-none focus:border-ish-stratus-blue/50 focus:ring-2 focus:ring-ish-stratus-blue/20"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className={cn(
                "rounded-full bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white shadow-[var(--shadow-ish-sm)] transition-all hover:opacity-90",
                inviting && "cursor-not-allowed opacity-60",
              )}
            >
              {inviting ? "Sending…" : "Invite"}
            </button>
          </div>
          {lastInviteUrl ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-ish-app/80 px-3 py-2.5 text-[11px]">
              <Mail className="size-4 shrink-0 text-ish-stratus-blue" />
              <span className="flex-1 truncate font-mono text-ish-ink-soft">{lastInviteUrl}</span>
              <button type="button" onClick={copyLink} className="flex shrink-0 items-center gap-1 font-semibold text-ish-ink hover:underline">
                <Copy className="size-3.5" /> Copy
              </button>
            </div>
          ) : null}
        </form>
      </SettingsGroup>

      <SettingsGroup title={`Members (${members.length})`}>
        {members.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ish-ink-faint">No team members yet.</p>
        ) : (
          members.map((m, i) => (
            <div key={m.id}>
              {i > 0 && <SettingsGroupDivider />}
              <SettingsRow className="justify-between">
                <div>
                  <p className="text-[14px] font-medium text-ish-ink">{m.name}</p>
                  <p className="text-[12px] text-ish-ink-soft">{m.email}</p>
                </div>
                <span className="rounded-full bg-ish-stratus-blue/15 px-2.5 py-0.5 text-[11px] font-semibold capitalize text-ish-ink">
                  {m.role}
                </span>
              </SettingsRow>
            </div>
          ))
        )}
      </SettingsGroup>

      {invites.length > 0 && (
        <SettingsGroup title="Pending Invites">
          {invites.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 && <SettingsGroupDivider />}
              <SettingsRow className="justify-between">
                <span className="text-[14px] font-medium text-ish-ink">{inv.email}</span>
                <span className="text-[11px] capitalize text-ish-ink-faint">
                  {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                </span>
              </SettingsRow>
            </div>
          ))}
        </SettingsGroup>
      )}
    </div>
  );
}
