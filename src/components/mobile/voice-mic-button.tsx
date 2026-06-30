"use client";

import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { toast } from "sonner";

type VoiceMicButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
};

export function VoiceMicButton({ onTranscript, disabled, className, size = "md" }: VoiceMicButtonProps) {
  const { supported, listening, toggle } = useVoiceInput((text) => {
    onTranscript(text);
    toast.success("Voice captured");
  });

  if (!supported) return null;

  const dim = size === "sm" ? "size-9" : "size-10";
  const icon = size === "sm" ? "size-4" : "size-4";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!supported) {
          toast.message("Voice input is not supported in this browser");
          return;
        }
        toggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-40",
        dim,
        listening ? "bg-ish-stratus-salmon text-white animate-pulse" : "bg-ish-canvas text-ish-ink",
        className,
      )}
      aria-label={listening ? "Stop listening" : "Start voice input"}
    >
      {listening ? <MicOff className={icon} /> : <Mic className={icon} />}
    </button>
  );
}
