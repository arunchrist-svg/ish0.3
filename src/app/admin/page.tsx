"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/design-system";

type TenantRow = {
  id: string;
  name: string;
  plan: string;
  demoMode: boolean;
  memberCount: number;
  credits: number | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [keys, setKeys] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((r) => {
        if (r.status === 403 || r.status === 401) {
          setForbidden(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.tenants) setTenants(data.tenants);
        fetch('/api/admin/keys').then((r) => r.ok ? r.json() : null).then(setKeys);
        setLoading(false);
      });
  }, []);

  async function toggleDemo(tenantId: string, demoMode: boolean) {
    await fetch("/api/admin/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, demoMode }),
    });
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, demoMode } : t)));
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-8 animate-spin" /></div>;
  if (forbidden) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p>Superadmin access required</p>
      <Button onClick={() => router.push("/")}>Back</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-ish-canvas p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <Shield className="size-8" />
          <h1 className="text-2xl font-bold">Platform Admin</h1>
      {keys && (
        <div className="mb-8 rounded-2xl border border-ish-border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Platform API keys</h2>
          <p className="mb-4 text-sm text-ish-ink-soft">Central keys you manage — customers never see these. Only visible to superadmin.</p>
          <pre className="overflow-auto rounded-xl bg-ish-canvas p-4 text-xs">{JSON.stringify(keys, null, 2)}</pre>
        </div>
      )}

        </div>
        <div className="overflow-hidden rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-ish-app text-left text-xs uppercase text-ish-ink-soft">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Demo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3">{t.plan}</td>
                  <td className="px-4 py-3">{t.memberCount}</td>
                  <td className="px-4 py-3">{t.credits ?? 0}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => toggleDemo(t.id, !t.demoMode)} className={`rounded-full px-3 py-1 text-xs font-medium ${t.demoMode ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
                      {t.demoMode ? "Demo ON" : "Live"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
