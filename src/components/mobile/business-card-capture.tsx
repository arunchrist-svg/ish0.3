"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BusinessCardFields } from "@/lib/enrichment/business-card-ocr";

type BusinessCardCaptureProps = {
  onExtracted: (fields: BusinessCardFields) => void;
};

export function BusinessCardCapture({ onExtracted }: BusinessCardCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  async function handleFile(file: File) {
    setScanning(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const res = await fetch("/api/contacts/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      onExtracted(data.fields as BusinessCardFields);
      toast.success("Business card scanned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not scan card");
    } finally {
      setScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={scanning}
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-ish-border bg-white px-4 text-[13px] font-semibold text-ish-ink shadow-sm active:scale-[0.98] disabled:opacity-50"
      >
        {scanning ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {scanning ? "Scanning..." : "Scan business card"}
      </button>
    </>
  );
}
