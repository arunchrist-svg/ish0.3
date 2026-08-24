"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Trash2, Building2, Users, Loader2 } from "lucide-react";
import { AppModal } from "@/components/ui/app-modal";
import {
  scoutDeleteSession,
  scoutListSessions,
  type ScoutSessionSummary,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sessionSubtitle(session: ScoutSessionSummary): string {
  const parts: string[] = [];
  parts.push(session.mode === "search" ? "Search" : "Autopilot");
  if (session.filters.locationScope === "focus") parts.push("Focus Area");
  const cityCount = session.filters.cities?.length ?? 0;
  if (cityCount > 0) parts.push(`${cityCount} location${cityCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

type Props = {
  open: boolean;
  onClose: () => void;
  activeSessionId?: string | null;
  onOpen: (sessionId: string) => void | Promise<void>;
  onDeleted?: (sessionId: string) => void;
};

export function ScoutHistoryPanel({ open, onClose, activeSessionId, onOpen, onDeleted }: Props) {
  const [sessions, setSessions] = useState<ScoutSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await scoutListSessions();
      setSessions(data.sessions);
    } catch {
      toast.error("Could not load Scout history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function handleOpen(id: string) {
    setOpeningId(id);
    try {
      await onOpen(id);
      onClose();
    } catch {
      toast.error("Could not open that Scout session");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await scoutDeleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
      onDeleted?.(id);
      toast.success("Scout session deleted");
    } catch {
      toast.error("Could not delete Scout session");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      panelClassName="ish-solid-sheet !max-h-[min(36rem,88dvh)] overflow-hidden !p-0 lg:!max-w-[440px] lg:!rounded-[20px]"
    >
      <div className="flex items-center gap-2 border-b border-[#e8ebf1] px-5 py-4">
        <History className="size-4 text-brand-ink-soft" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-brand-ink">Scout history</h2>
          <p className="text-[12px] text-brand-ink-faint">Open a past run to continue. Delete removes the session only.</p>
        </div>
      </div>

      <div className="max-h-[min(28rem,70dvh)] overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-brand-ink-faint">
            <Loader2 className="size-4 animate-spin" />
            Loading sessions
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-12 text-center text-[13px] text-brand-ink-faint">
            No Scout sessions yet. Run Autopilot or Search and results will appear here.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              const confirming = confirmDeleteId === session.id;
              return (
                <li
                  key={session.id}
                  className={cn(
                    "rounded-xl border px-3.5 py-3 transition-colors",
                    active ? "border-brand-stratus-blue/40 bg-brand-stratus-blue/5" : "border-[#e8ebf1] bg-white",
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    disabled={Boolean(openingId)}
                    onClick={() => void handleOpen(session.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-brand-ink">{session.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-brand-ink-faint">{sessionSubtitle(session)}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-brand-ink-faint">{timeAgo(session.updatedAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-brand-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3" />
                        {session.companyCount} cos
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" />
                        {session.peopleCount} people
                      </span>
                      {active ? (
                        <span className="rounded-full bg-brand-stratus-blue/10 px-2 py-0.5 text-[10px] font-bold text-brand-stratus-blue">
                          Current
                        </span>
                      ) : null}
                      {openingId === session.id ? (
                        <Loader2 className="size-3.5 animate-spin text-brand-ink-faint" />
                      ) : null}
                    </div>
                  </button>

                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-[#eef1f6] pt-2">
                    {confirming ? (
                      <>
                        <span className="mr-auto text-[11px] text-brand-ink-faint">Delete this session?</span>
                        <button
                          type="button"
                          className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink-soft hover:bg-[#f4f6fa]"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === session.id}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11.5px] font-bold text-red-600 hover:bg-red-100"
                          onClick={() => void handleDelete(session.id)}
                          disabled={deletingId === session.id}
                        >
                          {deletingId === session.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-brand-ink-faint hover:bg-[#f4f6fa] hover:text-red-600"
                        onClick={() => setConfirmDeleteId(session.id)}
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppModal>
  );
}
