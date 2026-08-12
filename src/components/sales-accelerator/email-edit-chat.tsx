"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { reviseDraft } from "@/lib/api-client";
import type { EditMessage, WriterDraft } from "@/lib/api-client";
import { text } from "@/design-system/tokens";
import { toast } from "sonner";
import { VoiceMicButton } from "@/components/mobile/voice-mic-button";

const BASE_QUICK_PROMPTS = [
  "Make it shorter",
  "More formal tone",
  "Stronger CTA",
  "Fix the subject lines",
];

const CONTENT_SCORE_PROMPT = "Make Content score higher";

type Props = {
  leadOutreachId: string;
  messages: EditMessage[];
  disabled?: boolean;
  embedded?: boolean;
  contentScore?: number;
  onDraftUpdated: (draft: WriterDraft, messages: EditMessage[]) => void;
};

export function EmailEditChat({
  leadOutreachId,
  messages: initialMessages,
  disabled,
  embedded = false,
  contentScore,
  onDraftUpdated,
}: Props) {
  const [messages, setMessages] = useState<EditMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [revising, setRevising] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [leadOutreachId, initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, revising]);

  const quickPrompts = [
    ...(contentScore == null || contentScore < 80 ? [CONTENT_SCORE_PROMPT] : []),
    ...BASE_QUICK_PROMPTS,
  ];

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

  const pad = embedded ? "px-4" : "px-4 sm:px-5";

  return (
    <div className={cn("flex flex-col", embedded && "bg-transparent")}>
      {(messages.length > 0 || revising) && (
        <div className={cn("space-y-3 pb-2 pt-2", pad)}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}
            >
              <span className={cn(text.label, "px-1")}>{msg.role === "user" ? "You" : "AI"}</span>
              <div
                className={cn(
                  "max-w-[92%] rounded-[14px] px-3.5 py-2.5 sm:max-w-[85%]",
                  text.bodySoft,
                  msg.role === "user"
                    ? "rounded-br-[4px] bg-brand-black text-white"
                    : "rounded-bl-[4px] border border-brand-border/50 bg-brand-canvas/50 text-brand-ink",
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {revising && (
            <div className="flex flex-col items-start gap-1">
              <span className={cn(text.label, "px-1")}>AI</span>
              <div className={cn("flex items-center gap-2 rounded-[14px] rounded-bl-[4px] border border-brand-border/50 bg-brand-canvas/50 px-3.5 py-2.5", text.caption)}>
                <Loader2 className="size-3.5 animate-spin" />
                Updating draft…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {!disabled ? (
        <div
          className={cn(
            pad,
            "pb-4",
            embedded ? "border-t border-brand-stratus-blue/12 bg-transparent pt-3.5" : "border-t border-brand-border/50 bg-white/70 py-3 backdrop-blur-sm",
          )}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {embedded ? (
              <Sparkles className="size-3.5 shrink-0 text-brand-ink-faint" aria-hidden />
            ) : (
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-black text-white shadow-[var(--shadow-brand-sm)]"
                aria-hidden
              >
                <Sparkles className="size-3.5" />
              </div>
            )}
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={revising}
                onClick={() => sendMessage(prompt)}
                className={cn(
                  "rounded-full border px-3 py-1.5 font-semibold transition-colors",
                  "text-[11px] text-brand-ink-soft hover:border-brand-stratus-blue/40 hover:bg-white hover:text-brand-ink disabled:opacity-40",
                  embedded
                    ? "border-brand-stratus-blue/20 bg-white"
                    : "border-brand-border/50 bg-white",
                )}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-end gap-2.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={revising}
              rows={2}
              placeholder="Ask for a specific change (e.g. fix the second paragraph, or change one line…)"
              className={cn(
                "min-h-[52px] max-h-[120px] min-w-0 flex-1 resize-none rounded-[16px] border border-brand-stratus-blue/20 px-4 py-3",
                text.bodySoft,
                "outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12 disabled:opacity-50",
                embedded ? "bg-white" : "bg-white",
              )}
            />
            <VoiceMicButton
              disabled={revising}
              onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
            />
            <button
              type="submit"
              disabled={revising || !input.trim()}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-stratus-blue text-white shadow-[var(--shadow-brand-sm)] transition-all hover:opacity-90 disabled:opacity-40"
              aria-label="Send edit"
            >
              {revising ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      ) : (
        <p className={cn(text.caption, "border-t border-brand-border/50 px-4 py-3 text-center sm:px-5")}>
          Chat editing is disabled after approval or rejection.
        </p>
      )}
    </div>
  );
}
