"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { reviseDraft } from "@/lib/api-client";
import type { EditMessage, WriterDraft } from "@/lib/api-client";
import { toast } from "sonner";

const QUICK_PROMPTS = [
  "Make it shorter",
  "More formal tone",
  "Stronger CTA",
  "Fix the subject lines",
];

type Props = {
  leadOutreachId: string;
  messages: EditMessage[];
  disabled?: boolean;
  onDraftUpdated: (draft: WriterDraft, messages: EditMessage[]) => void;
};

export function EmailEditChat({ leadOutreachId, messages: initialMessages, disabled, onDraftUpdated }: Props) {
  const [messages, setMessages] = useState<EditMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [revising, setRevising] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [leadOutreachId, initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, revising]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || disabled || revising) return;

    setInput("");
    setRevising(true);

    const optimisticUser: EditMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const result = await reviseDraft(leadOutreachId, trimmed);
      setMessages(result.messages);
      onDraftUpdated(result.draft, result.messages);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
      toast.error(e instanceof Error ? e.message : "Could not revise draft");
    } finally {
      setRevising(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex items-center gap-2.5 border-b border-ish-border/80 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-ish-black text-white shadow-[var(--shadow-ish-sm)]">
          <Sparkles className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-ish-ink">Edit with AI</div>
          <div className="text-[11px] text-ish-ink-faint">Changes update the draft instantly</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !revising ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-[14px] border border-dashed border-ish-border/80 bg-white/70 px-4 py-6 text-center">
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-ish-yellow-soft">
              <Wand2 className="size-4 text-ish-ink-soft" />
            </div>
            <p className="text-[12px] font-semibold text-ish-ink">Refine your email</p>
            <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-ish-ink-faint">
              Ask for tone changes, shorter copy, or tweak the greeting and subject lines.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}
              >
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <div
                  className={cn(
                    "max-w-[92%] rounded-[14px] px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                    msg.role === "user"
                      ? "rounded-br-[4px] bg-ish-black text-white"
                      : "rounded-bl-[4px] border border-ish-border bg-white text-ish-ink shadow-[var(--shadow-ish-sm)]",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {revising && (
              <div className="flex flex-col items-start gap-1">
                <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">AI</span>
                <div className="flex items-center gap-2 rounded-[14px] rounded-bl-[4px] border border-ish-border bg-white px-3.5 py-2.5 text-[12px] text-ish-ink-faint shadow-[var(--shadow-ish-sm)]">
                  <Loader2 className="size-3.5 animate-spin" />
                  Updating draft…
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!disabled ? (
        <div className="mt-auto border-t border-ish-border/80 bg-white/80 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={revising}
                onClick={() => sendMessage(prompt)}
                className="rounded-full border border-ish-border bg-white px-2.5 py-1 text-[10px] font-semibold text-ish-ink-soft transition-colors hover:border-ish-ink/20 hover:bg-ish-canvas hover:text-ish-ink disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={revising}
              rows={2}
              placeholder="e.g. change greeting to Hi Vikram, mention bulk pricing…"
              className="min-h-[44px] max-h-[100px] min-w-0 flex-1 resize-none rounded-[14px] border border-ish-border bg-white px-3.5 py-2.5 text-[12px] leading-relaxed text-ish-ink outline-none placeholder:text-ish-ink-faint focus:border-ish-black disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={revising || !input.trim()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ish-black text-white shadow-[var(--shadow-ish-sm)] transition-all hover:bg-ish-black/90 disabled:opacity-40"
              aria-label="Send edit"
            >
              {revising ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
          <p className="mt-1.5 text-center text-[10px] text-ish-ink-faint">Enter to send · Shift+Enter for new line</p>
        </div>
      ) : (
        <p className="border-t border-ish-border/80 px-4 py-3 text-center text-[11px] text-ish-ink-faint">
          Chat editing is disabled after approval or rejection.
        </p>
      )}
    </div>
  );
}
