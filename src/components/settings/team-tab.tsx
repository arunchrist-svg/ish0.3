"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Clock, Copy, ExternalLink, Loader2, Mail, UserPlus, Users } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import { cn } from "@/lib/utils";
import { SMTP_SERVER_OPTIONS, type SmtpServerId } from "@/lib/email/config";
import { toast } from "sonner";

type Member = { id: string; name: string; email: string; role: string; status?: string; linkedIn?: string | null };
type Invite = { id: string; email: string; role: string; expiresAt: string };

const ROLES = ["admin", "member", "viewer"] as const;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const inputClass =
  "ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2.5 text-[13px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12";

const selectClass =
  "rounded-full border border-brand-stratus-blue/25 bg-white/80 px-3 py-1.5 text-[12px] font-semibold capitalize text-brand-ink shadow-[var(--shadow-brand-sm)] outline-none focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12";

const primaryBtnClass =
  "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-full bg-brand-stratus-blue px-5 text-[12px] font-semibold text-white shadow-[var(--shadow-brand-sm)] transition-colors hover:bg-brand-stratus-blue/90 disabled:cursor-not-allowed disabled:opacity-50";

function memberInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function TeamField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-semibold text-brand-ink">{label}</label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-brand-ink-soft">{hint}</p> : null}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "owner") {
    return (
      <span className="rounded-full bg-brand-stratus-blue/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-stratus-blue">
        Owner
      </span>
    );
  }
  return (
    <span className="rounded-full border border-brand-stratus-blue/20 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-brand-ink-soft">
      {ROLE_LABELS[role as (typeof ROLES)[number]] ?? role}
    </span>
  );
}

function MemberAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow-soft text-[12px] font-bold text-brand-ink shadow-[var(--shadow-brand-sm)] ring-1 ring-brand-stratus-blue/10"
      aria-hidden
    >
      {memberInitials(name)}
    </div>
  );
}

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
      <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-brand-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin text-brand-stratus-blue" /> Loading team…
      </div>
    );
  }

  const mailHostLabel = SMTP_SERVER_OPTIONS.find((o) => o.value === mailHost)?.label ?? "Zoho India";

  return (
    <div className="pb-6">
      <SettingsGroup
        title="Add teammate"
        footer={
          mode === "create"
            ? "Creates a login immediately. Share the temp password securely."
            : "Emails a join link plus full inbox setup steps for the mail host you pick."
        }
        className="mb-4"
      >
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
        <form onSubmit={mode === "create" ? handleCreate : handleInvite} className="space-y-4 px-4 py-4">
          {mode === "create" ? (
            <TeamField label="Full name">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prashant Mishra" required className={inputClass} />
            </TeamField>
          ) : null}

          <TeamField label="Work email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              className={inputClass}
            />
          </TeamField>

          {mode === "create" ? (
            <TeamField label="LinkedIn (optional)" hint="Used for network matching in Scout.">
              <input
                type="url"
                value={linkedIn}
                onChange={(e) => setLinkedIn(e.target.value)}
                placeholder="linkedin.com/in/…"
                className={inputClass}
              />
            </TeamField>
          ) : null}

          <SettingsRow className="justify-between !px-0 py-0">
            <span className="text-[13px] font-semibold text-brand-ink">Role</span>
            <SettingsSegmented
              value={role}
              onChange={(next) => setRole(next as (typeof ROLES)[number])}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          </SettingsRow>

          {mode === "invite" ? (
            <>
              <SettingsRow className="justify-between !px-0 py-0">
                <div className="min-w-0 pr-3">
                  <span className="text-[13px] font-semibold text-brand-ink">Inbox setup</span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-brand-ink-soft">
                    Included in the invite email: App Password, host, verify, test, then live.
                  </p>
                </div>
              </SettingsRow>
              <SettingsSegmented
                value={mailHost}
                onChange={(next) => setMailHost(next as SmtpServerId)}
                options={SMTP_SERVER_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label === "Zoho India" ? "Zoho IN" : option.label,
                }))}
                className="w-full justify-center"
              />
            </>
          ) : null}

          <button type="submit" disabled={submitting} className={cn(primaryBtnClass, "w-full sm:w-auto")}>
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Working…
              </>
            ) : (
              <>
                <UserPlus className="size-3.5" />
                {mode === "create" ? "Create user" : `Invite with ${mailHostLabel}`}
              </>
            )}
          </button>

          {lastTempPassword ? (
            <div className="rounded-xl border border-brand-stratus-yellow/35 bg-brand-yellow-soft/70 px-4 py-3">
              <p className="text-[12px] font-semibold text-brand-ink">Temp password</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="rounded-lg bg-white/80 px-2 py-1 font-mono text-[13px] font-bold text-brand-ink">
                  {lastTempPassword}
                </code>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-stratus-blue hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastTempPassword);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </button>
              </div>
            </div>
          ) : null}

          {lastInviteUrl ? (
            <div className="rounded-xl border border-brand-stratus-blue/20 bg-brand-app/60 px-4 py-3">
              <p className="text-[12px] font-semibold text-brand-ink">Invite link</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-brand-ink-soft">{lastInviteUrl}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastInviteUrl);
                    toast.success("Copied");
                  }}
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-brand-stratus-blue hover:underline"
                >
                  <Copy className="size-3.5" /> Copy
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </SettingsGroup>

      <SettingsGroup title={`Members · ${members.length}`} className="mb-4">
        {members.length === 0 ? (
          <SettingsRow className="justify-center py-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <Users className="size-8 text-brand-ink-faint" />
              <p className="text-[13px] font-medium text-brand-ink-soft">No members yet</p>
            </div>
          </SettingsRow>
        ) : (
          members.map((m, i) => (
            <div key={m.id}>
              {i > 0 ? <SettingsGroupDivider /> : null}
              <SettingsRow className="items-start gap-3 py-3.5">
                <MemberAvatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-brand-ink">{m.name}</p>
                      <p className="truncate text-[12px] text-brand-ink-soft">{m.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {m.role === "owner" ? (
                        <RoleBadge role={m.role} />
                      ) : (
                        <>
                          <select
                            value={m.role}
                            onChange={(e) => updateMemberRole(m.id, e.target.value)}
                            className={selectClass}
                            aria-label={`Role for ${m.name}`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeMember(m.id)}
                            className="rounded-full px-2 py-1 text-[11px] font-semibold text-brand-stratus-salmon hover:bg-brand-pink-soft/60"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <input
                      type="url"
                      value={memberLinkedIn[m.id] ?? ""}
                      onChange={(e) => setMemberLinkedIn((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      onBlur={() => void saveMemberLinkedIn(m.id)}
                      placeholder="LinkedIn profile URL"
                      className={cn(inputClass, "py-2 text-[12px]")}
                    />
                    {m.linkedIn ? (
                      <a
                        href={m.linkedIn}
                        target="_blank"
                        rel="noreferrer"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-stratus-blue/20 bg-white/80 text-brand-stratus-blue shadow-[var(--shadow-brand-sm)] hover:border-brand-stratus-blue/40"
                        aria-label={`Open ${m.name} on LinkedIn`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </SettingsRow>
            </div>
          ))
        )}
      </SettingsGroup>

      <SettingsGroup
        title={`Pending invites · ${invites.length}`}
        footer={invites.length > 0 ? "Invites expire after 7 days." : undefined}
        className="mb-4"
      >
        {invites.length === 0 ? (
          <SettingsRow className="justify-center py-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <Mail className="size-8 text-brand-ink-faint" />
              <p className="text-[13px] font-medium text-brand-ink-soft">No pending invites</p>
            </div>
          </SettingsRow>
        ) : (
          invites.map((inv, i) => (
            <div key={inv.id}>
              {i > 0 ? <SettingsGroupDivider /> : null}
              <SettingsRow className="justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-canvas text-brand-stratus-blue ring-1 ring-brand-stratus-blue/15">
                    <Clock className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-brand-ink">{inv.email}</p>
                    <p className="text-[11px] text-brand-ink-faint">
                      Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RoleBadge role={inv.role} />
                  <button
                    type="button"
                    onClick={() => revokeInvite(inv.id)}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-brand-stratus-salmon hover:bg-brand-pink-soft/60"
                  >
                    Revoke
                  </button>
                </div>
              </SettingsRow>
            </div>
          ))
        )}
      </SettingsGroup>
    </div>
  );
}
