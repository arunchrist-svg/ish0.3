/** Keep only the prospect's latest reply text, not quoted thread history. */
export function extractLatestReplyText(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";

  let text = raw.replace(/\r\n/g, "\n").trim();

  const splitPatterns = [
    /\nOn .{10,120}wrote:\s*\n/i,
    /\n_{3,}\s*\n/,
    /\nFrom:\s.+\nSent:\s.+\n/i,
    /\n-{3,}\s*Original Message\s*-{3,}\n/i,
  ];

  for (const pattern of splitPatterns) {
    const match = text.match(pattern);
    if (match?.index && match.index > 0) {
      text = text.slice(0, match.index);
    }
  }

  const lines = text
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .trim();

  return lines.slice(0, 4000);
}
