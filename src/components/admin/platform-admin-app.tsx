"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, Copy, ExternalLink, Loader2, Plus, RefreshCw, Shield, Users,
} from "lucide-react";
import { Button } from "@/design-system";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsHero } from "@/components/settings/settings-hero";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  demoMode: boolean;
  memberCount: number;
  credits: number | null;
};

const inputClass =
  "w-full rounded-xl border border-ish-border/60 bg-white/80 px-4 py-2.5 text-[13px] shadow-[var(--shadow-ish-sm)] outline-none transition-all focus:border-ish-stratus-blue/50 focus:ring-2 focus:ring-ish-stratus-blue/20";

export function PlatformAdminApp() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState("starter");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState<Record<string, string>>({});

  async function loadTenants() {
    setLoading(true);
    const r = await fetch("/api/admin/tenants");
    if (r.ok) {
      const data = await r.json();
      setTenants(data.tenants ?? []);
    } else {
      toast.error("Failed to load organizations");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  async function toggleDemo(tenantId: string, demoMode: boolean) {
    await fetch("/api/admin/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, demoMode }),
    });
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, demoMode } : t)));
    toast.success(demoMode ? "Demo mode enabled" : "Live mode enabled");
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setLastInviteUrl("");
    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || undefined, ownerEmail, plan }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create organization");
      return;
    }
    setLastInviteUrl(data.inviteUrl ?? "");
    setName("");
    setSlug("");
    setOwnerEmail("");
    setShowCreate(false);
    toast.success("Organization created");
    void loadTenants();
  }

  async function bootstrapOwner(tenantId: string) {
    const email = bootstrapEmail[tenantId]?.trim();
    if (!email) {
      toast.error("Enter an owner email first");
      return;
    }
    const res = await fetch(`/api/admin/tenants/${tenantId}/bootstrap-owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerEmail: email }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create owner invite");
      return;
    }
    setLastInviteUrl(data.inviteUrl ?? "");
    toast.success("Owner invite ready. Copy the link below.");
  }

  function copyInvite(url: string) {
    void navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-ish-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="mx-auto max-w-3xl">
          <SettingsHero
            icon={Shield}
            title="Platform Admin"
            subtitle="Provision customer organizations and send owner invite links"
            action={
              <Button
                type="button"
                onClick={() => setShowCreate((v) => !v)}
                className="rounded-full bg-ish-black px-4 py-2 text-[13px] font-semibold text-white"
              >
                <Plus className="mr-1.5 inline size-4" />
                New company
              </Button>
            }
          />

          {lastInviteUrl ? (
            <SettingsGroup title="Owner invite link" footer="Copy and send this link to the account holder. They will set their password and complete onboarding.">
              <div className="flex items-center gap-2 px-4 py-3.5">
                <span className="flex-1 truncate font-mono text-[12px] text-ish-ink-soft">{lastInviteUrl}</span>
                <button type="button" onClick={() => copyInvite(lastInviteUrl)} className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ish-ink hover:underline">
                  <Copy className="size-3.5" /> Copy
                </button>
              </div>
            </SettingsGroup>
          ) : null}

          {showCreate ? (
            <SettingsGroup title="New organization" footer="Creates the company shell and an owner invite. The owner completes signup via the invite link.">
              <form onSubmit={createTenant} className="space-y-3 px-4 py-4">
                <input className={inputClass} placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
                <input className={inputClass} placeholder="Slug (optional, auto-generated if blank)" value={slug} onChange={(e) => setSlug(e.target.value)} />
                <input className={inputClass} type="email" placeholder="Owner email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
                <select className={inputClass} value={plan} onChange={(e) => setPlan(e.target.value)}>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="scale">Scale</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={creating} className="rounded-full bg-ish-black px-5 py-2.5 text-[13px] font-semibold text-white">
                    {creating ? "Creating…" : "Create organization"}
                  </Button>
                  <button type="button" onClick={() => setShowCreate(false)} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-ish-ink-soft hover:text-ish-ink">
                    Cancel
                  </button>
                </div>
              </form>
            </SettingsGroup>
          ) : null}

          <SettingsGroup
            title={`Organizations (${tenants.length})`}
            footer="Each row is a customer company (tenant). Use Owner invite when a company has no active owner yet."
          >
            <div className="flex items-center justify-end px-4 pt-3">
              <button type="button" onClick={() => void loadTenants()} className="flex items-center gap-1.5 text-[12px] font-medium text-ish-ink-soft hover:text-ish-ink">
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-6 animate-spin text-ish-ink-soft" />
              </div>
            ) : tenants.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-ish-ink-faint">No organizations yet. Create your first company above.</p>
            ) : (
              tenants.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <SettingsGroupDivider />}
                  <SettingsRow className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ish-stratus-blue/10">
                        <Building2 className="size-4 text-ish-stratus-blue" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-ish-ink">{t.name}</p>
                        <p className="font-mono text-[11px] text-ish-ink-soft">{t.slug}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ish-ink-faint">
                          <span className="capitalize">{t.plan}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1"><Users className="size-3" />{t.memberCount}</span>
                          <span>·</span>
                          <span>{t.credits ?? 0} credits</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:items-end">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDemo(t.id, !t.demoMode)}
                          className={cn(
                            "rounded-full px-3 py-1 text-[11px] font-semibold",
                            t.demoMode ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900",
                          )}
                        >
                          {t.demoMode ? "Demo" : "Live"}
                        </button>
                      </div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-ish-border/60 px-2.5 py-1.5 text-[11px] sm:w-40"
                          placeholder="Owner email"
                          value={bootstrapEmail[t.id] ?? ""}
                          onChange={(e) => setBootstrapEmail((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => void bootstrapOwner(t.id)}
                          className="shrink-0 rounded-full bg-ish-app px-3 py-1.5 text-[11px] font-semibold text-ish-ink hover:bg-ish-border/40"
                        >
                          Owner invite
                        </button>
                      </div>
                    </div>
                  </SettingsRow>
                </div>
              ))
            )}
          </SettingsGroup>

          <SettingsGroup title="Platform keys" footer="API key status for the platform. Configure keys in your environment. Per-tenant email is managed in each company's Settings.">
            <SettingsRow as="div">
              <div className="flex w-full items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-medium text-ish-ink">View key status</p>
                  <p className="text-[12px] text-ish-ink-soft">LLM, enrichment, email, and Stripe configuration</p>
                </div>
                <Link
                  href="/settings?tab=ai-usage"
                  className="inline-flex items-center gap-1 rounded-full bg-ish-black px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                >
                  Open <ExternalLink className="size-3" />
                </Link>
              </div>
            </SettingsRow>
          </SettingsGroup>
        </div>
      </div>
    </div>
  );
}
