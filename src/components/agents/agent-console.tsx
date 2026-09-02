"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Bot, CheckCircle2, Loader2, Send, Square } from "lucide-react";
import { AppPageHeader, MobilePageLayout } from "@/design-system";
import { cn } from "@/lib/utils";

type ConsoleEvent = {
  id: number;
  tone: "neutral" | "working" | "success" | "error";
  label: string;
  detail?: string;
};

type ServerEvent =
  | { type: "status"; message: string }
  | { type: "tool-start"; toolName: string; input: unknown }
  | { type: "tool-complete"; toolName: string; output: unknown }
  | { type: "tool-error"; toolName: string; message: string }
  | { type: "text-delta"; text: string }
  | { type: "complete"; iterations: number }
  | { type: "error"; message: string };

function toolLabel(toolName: string): string {
  switch (toolName) {
    case "updateLeadStatus":
      return "Updating Lead Status";
    case "scheduleCadence":
      return "Updating Follow-up Cadence";
    case "enrichContact":
      return "Enriching Lead Data";
    case "delegateToWorker":
      return "Delegating Analysis";
    default:
      return toolName;
  }
}

function formatDetail(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 280 ? `${text.slice(0, 280)}...` : text;
  } catch {
    return "Completed";
  }
}

export function AgentConsole() {
  const searchParams = useSearchParams();
  const abortRef = useRef<AbortController | null>(null);
  const nextEventId = useRef(0);
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [leadId, setLeadId] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("ish-agent-session-id");
    const next = stored || window.crypto.randomUUID();
    window.localStorage.setItem("ish-agent-session-id", next);
    const timeout = window.setTimeout(() => {
      setSessionId(next);
      setLeadId(searchParams.get("leadId") ?? "");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  function addEvent(event: Omit<ConsoleEvent, "id">) {
    setEvents((current) => [...current, { ...event, id: nextEventId.current++ }]);
  }

  function handleServerEvent(event: ServerEvent) {
    switch (event.type) {
      case "status":
        addEvent({ tone: "neutral", label: event.message });
        break;
      case "tool-start":
        addEvent({ tone: "working", label: toolLabel(event.toolName), detail: formatDetail(event.input) });
        break;
      case "tool-complete":
        addEvent({ tone: "success", label: `${toolLabel(event.toolName)} complete`, detail: formatDetail(event.output) });
        break;
      case "tool-error":
        addEvent({ tone: "error", label: `${toolLabel(event.toolName)} failed`, detail: event.message });
        break;
      case "text-delta":
        setAnswer((current) => current + event.text);
        break;
      case "complete":
        addEvent({
          tone: "success",
          label: "Agent run complete",
          detail: `${event.iterations} step${event.iterations === 1 ? "" : "s"} used`,
        });
        setRunning(false);
        break;
      case "error":
        addEvent({ tone: "error", label: "Agent run failed", detail: event.message });
        setRunning(false);
        break;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || running || !sessionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setAnswer("");
    setEvents([]);

    try {
      const response = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          session_id: sessionId,
          leadId: leadId.trim() || undefined,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({ error: "Agent request failed" }));
        throw new Error(typeof body.error === "string" ? body.error : "Agent request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim();
          if (data) handleServerEvent(JSON.parse(data) as ServerEvent);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      addEvent({
        tone: "error",
        label: "Unable to reach the agent",
        detail: error instanceof Error ? error.message : "Try again",
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stopRun() {
    abortRef.current?.abort();
    setRunning(false);
    addEvent({ tone: "neutral", label: "Agent run stopped" });
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AppPageHeader icon={Bot} title="Agent Console" />
      <MobilePageLayout title="Agent Console" contentClassName="bg-transparent">
      <main className="min-w-0 bg-transparent px-4 py-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:px-8">
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <section className="rounded-[22px] border border-brand-border bg-white p-5 shadow-[var(--shadow-brand-sm)] sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-black text-white">
                <Bot className="size-5" />
              </div>
              <div>
                <h1 className="text-[17px] font-bold text-brand-ink">What should I handle?</h1>
                <p className="mt-1 text-[12.5px] leading-relaxed text-brand-ink-soft">
                  Ask the Supervisor to update a lead, manage its cadence, enrich contact data, or explain a recommendation.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Lead ID, optional
                </span>
                <input
                  value={leadId}
                  onChange={(event) => setLeadId(event.target.value)}
                  placeholder="Paste a lead UUID when working on one lead"
                  className="w-full rounded-xl border border-brand-border bg-brand-canvas px-3.5 py-3 text-[12.5px] text-brand-ink outline-none transition focus:border-brand-ink/40 focus:ring-2 focus:ring-brand-yellow/40"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  Request
                </span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={running}
                  rows={5}
                  maxLength={4000}
                  placeholder="Example: Enrich this lead and tell me whether the contact is ready for outreach."
                  className="w-full resize-y rounded-xl border border-brand-border bg-white px-3.5 py-3 text-[13px] leading-relaxed text-brand-ink outline-none transition focus:border-brand-ink/40 focus:ring-2 focus:ring-brand-yellow/40 disabled:bg-brand-canvas"
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-brand-ink-faint">Runs are capped at five Supervisor steps.</span>
                {running ? (
                  <button
                    type="button"
                    onClick={stopRun}
                    className="flex items-center gap-2 rounded-xl border border-brand-border px-4 py-2.5 text-[12px] font-bold text-brand-ink-soft hover:bg-brand-canvas"
                  >
                    <Square className="size-3.5" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!prompt.trim() || !sessionId}
                    className="flex items-center gap-2 rounded-xl bg-brand-black px-4 py-2.5 text-[12px] font-bold text-white shadow-[var(--shadow-brand)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="size-3.5" />
                    Run agent
                  </button>
                )}
              </div>
            </form>

            {(answer || running) && (
              <div className="mt-7 rounded-2xl bg-brand-canvas p-4">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ink-faint">
                  {running ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5 text-brand-green" />}
                  Supervisor response
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-brand-ink">
                  {answer || "Planning..."}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-[22px] border border-brand-border bg-white p-5 shadow-[var(--shadow-brand-sm)] sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-brand-ink">Run timeline</h2>
                <p className="mt-1 text-[11.5px] text-brand-ink-faint">Tool calls and observations appear here.</p>
              </div>
              {events.length > 0 && <span className="rounded-full bg-brand-canvas px-2 py-1 text-[10px] font-bold text-brand-ink-soft">{events.length}</span>}
            </div>
            <div className="space-y-3" aria-live="polite">
              {events.length === 0 ? (
                <div className="rounded-xl border border-dashed border-brand-border p-4 text-[12px] leading-relaxed text-brand-ink-faint">
                  Your first run will show each decision and CRM operation as it happens.
                </div>
              ) : (
                events.map((item) => (
                  <div key={item.id} className="flex gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                        item.tone === "error" && "bg-red-100 text-red-700",
                        item.tone === "success" && "bg-brand-green-soft text-brand-green",
                        item.tone === "working" && "bg-brand-yellow-soft text-amber-700",
                        item.tone === "neutral" && "bg-brand-canvas text-brand-ink-soft",
                      )}
                    >
                      {item.tone === "error" ? <AlertCircle className="size-3" /> : item.tone === "working" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-brand-ink">{item.label}</p>
                      {item.detail && <p className="mt-0.5 break-words text-[10.5px] leading-relaxed text-brand-ink-faint">{item.detail}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
      </MobilePageLayout>
    </div>
  );
}
