export type PasswordStrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export type PasswordStrength = {
  score: number;
  level: PasswordStrengthLevel;
  label: string;
  /** Segment fill count out of 4 (0 when empty). */
  segments: number;
};

const BY_SCORE: Record<1 | 2 | 3 | 4, { level: Exclude<PasswordStrengthLevel, "empty">; label: string }> = {
  1: { level: "weak", label: "Weak" },
  2: { level: "fair", label: "Fair" },
  3: { level: "good", label: "Good" },
  4: { level: "strong", label: "Strong" },
};

/**
 * Lightweight password strength for UI guidance.
 * Does not replace validation (min length is still enforced separately).
 */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, level: "empty", label: "", segments: 0 };
  }

  const length = password.length;

  // Under the minimum length, always show as weak.
  if (length < 8) {
    return { score: 1, level: "weak", label: "Weak", segments: 1 };
  }

  let score = 1; // already meets 8+
  if (length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const capped = Math.min(score, 4) as 1 | 2 | 3 | 4;
  const { level, label } = BY_SCORE[capped];
  return { score, level, label, segments: capped };
}
