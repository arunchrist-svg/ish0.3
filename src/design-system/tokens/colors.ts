/** Avatar palette — cycles by index */
export const avatarColors = [
  "bg-ish-avatar-1",
  "bg-ish-avatar-2",
  "bg-ish-avatar-3",
  "bg-ish-avatar-4",
  "bg-ish-avatar-5",
  "bg-ish-avatar-6",
] as const;

export function getAvatarColor(index: number): string {
  return avatarColors[index % avatarColors.length];
}

/** Lead score badge tones */
export function getScoreTone(score: number) {
  if (score > 85) return "high" as const;
  if (score > 65) return "mid" as const;
  return "low" as const;
}

export const scoreToneClasses = {
  high: "bg-ish-black text-white",
  mid: "bg-[#fbe9c4] text-ish-ink",
  low: "bg-[#fbe0de] text-ish-ink",
} as const;
