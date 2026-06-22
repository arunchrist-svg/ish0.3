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

/** Gift/match score color — reads theme tokens (Stratus remaps via CSS vars). */
export function getScoreColor(score: number): string {
  if (score >= 75) return "var(--color-score-high)";
  if (score >= 50) return "var(--color-score-mid)";
  return "var(--color-score-low)";
}
