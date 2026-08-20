export type EmailLogStatus = "opened" | "delivered" | "bounced";

export function deriveEmailLogStatus(row: {
  bouncedAt?: Date | string | null;
  openedAt?: Date | string | null;
}): EmailLogStatus {
  if (row.bouncedAt) return "bounced";
  if (row.openedAt) return "opened";
  return "delivered";
}
