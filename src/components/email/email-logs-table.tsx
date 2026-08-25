"use client";

import { Ban, CheckCircle2, Eye, Mail, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelCard, text } from "@/design-system";
import type { EmailLogRow, EmailLogStatus, EmailLogsData } from "@/lib/api-client";

const STATUS_FILTERS: { id: "all" | EmailLogStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "opened", label: "Opened" },
  { id: "delivered", label: "Delivered" },
  { id: "bounced", label: "Bounced" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusPill({ row }: { row: EmailLogRow }) {
  if (row.status === "bounced") {
    return (
      <span
        title={row.bounceReason ?? "Bounced"}
        className="inline-flex items-center gap-1 rounded-full bg-brand-pink-soft px-2.5 py-1 text-[10px] font-bold text-brand-stratus-salmon ring-1 ring-brand-stratus-salmon/25"
      >
        <Ban className="size-3" />
        Bounced
      </span>
    );
  }
  if (row.status === "opened") {
    return (
      <span
        title="Tracking pixel loaded. Not the same as Gmail read/unread."
        className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200/80"
      >
        <Eye className="size-3" />
        Opened
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-green-soft px-2.5 py-1 text-[10px] font-bold text-brand-green ring-1 ring-brand-green/20">
      <CheckCircle2 className="size-3" />
      Delivered
    </span>
  );
}

export function EmailLogsTable({
  data,
  loading,
  search,
  status,
  onSearchChange,
  onStatusChange,
  onRowClick,
}: {
  data: EmailLogsData | null;
  loading: boolean;
  search: string;
  status: "all" | EmailLogStatus;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: "all" | EmailLogStatus) => void;
  onRowClick: (leadId: string) => void;
}) {
  const items = data?.items ?? [];
  const counts = data?.counts;

  return (
    <div className="space-y-3 pb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const count =
              filter.id === "all"
                ? counts?.all
                : filter.id === "opened"
                  ? counts?.opened
                  : filter.id === "delivered"
                    ? counts?.delivered
                    : counts?.bounced;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onStatusChange(filter.id)}
                className={cn(
                  "ish-email-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors",
                  status === filter.id
                    ? "border-brand-black/80 bg-brand-black text-white"
                    : "border-brand-border/70 bg-white/70 text-brand-ink-soft hover:border-brand-ink/20 hover:text-brand-ink",
                )}
              >
                {filter.label}
                {typeof count === "number" && (
                  <span className={cn("tabular-nums", status === filter.id ? "text-white/80" : "text-brand-ink-faint")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-[240px]">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search email or subject"
            className="ish-email-search w-full rounded-full border border-brand-border/70 bg-white/70 py-2 pl-9 pr-3 text-[12px] text-brand-ink outline-none backdrop-blur-sm transition-colors focus:border-[rgba(var(--brand-stratus-blue-rgb),0.45)] focus:bg-white"
          />
        </div>
      </div>

      {loading && !data ? (
        <div className="ish-email-logs animate-pulse overflow-hidden rounded-[18px] border border-brand-border/60">
          <div className="h-10 bg-brand-border/40" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 border-t border-brand-border/40 bg-white/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <PanelCard className="flex flex-col items-center justify-center py-14 text-center">
          <Mail className="mb-2 size-8 text-brand-ink-faint" />
          <p className={cn(text.body, "font-semibold text-brand-ink")}>
            {search.trim() || status !== "all" ? "No matching sends" : "No sends yet"}
          </p>
          <p className="mt-1 text-[12px] text-brand-ink-soft">
            {search.trim() || status !== "all"
              ? "Try a different status filter or clear search."
              : "Sent emails appear here with delivered, opened, or bounced status."}
          </p>
        </PanelCard>
      ) : (
        <div className="ish-email-logs overflow-hidden rounded-[18px] border border-brand-border/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-brand-ink-faint">
                  <th className="px-4 py-3">To</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Subject</th>
                  <th className="px-4 py-3 text-right">Sent</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onRowClick(row.leadId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row.leadId);
                      }
                    }}
                    className="ish-email-logs-row cursor-pointer border-t border-brand-border/50 text-[12.5px] text-brand-ink transition-colors"
                  >
                    <td className="max-w-[240px] px-4 py-3">
                      <div className="truncate font-semibold">{row.to}</div>
                      <div className="truncate text-[11px] text-brand-ink-soft">
                        {row.contactName}
                        {row.companyName ? ` · ${row.companyName}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill row={row} />
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="truncate text-brand-ink">{row.subject}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-[12px] text-brand-ink-soft">
                      {row.sentAt ? timeAgo(row.sentAt) : "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.total > items.length && (
            <div className="flex items-center justify-between gap-3 border-t border-brand-border/50 px-4 py-2.5">
              <p className="text-[11px] text-brand-ink-faint">
                Showing {items.length} of {data.total} sends
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
