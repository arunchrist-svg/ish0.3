/** Avatar palette — cycles by index */
export const avatarColors = [
  "bg-brand-avatar-1",
  "bg-brand-avatar-2",
  "bg-brand-avatar-3",
  "bg-brand-avatar-4",
  "bg-brand-avatar-5",
  "bg-brand-avatar-6",
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
  high: "bg-brand-black text-white",
  mid: "bg-[#fbe9c4] text-brand-ink",
  low: "bg-[#fbe0de] text-brand-ink",
} as const;

/** Gift/match score color — reads theme tokens (Stratus remaps via CSS vars). */
export function getScoreColor(score: number): string {
  if (score >= 75) return "var(--color-score-high)";
  if (score >= 50) return "var(--color-score-mid)";
  return "var(--color-score-low)";
}
