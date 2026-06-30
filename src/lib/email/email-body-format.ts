/**
 * Ensures email bodies use blank-line paragraph breaks for display and HTML rendering.
 */
export function normalizeEmailBody(body: string): string {
  const text = body.trim().replace(/\r\n/g, "\n");
  if (!text) return text;

  if (/\n\n/.test(text)) {
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return text;

  const paragraphs: string[] = [];
  let start = 0;

  if (/^(Hi|Dear|Hello)\b/i.test(sentences[0])) {
    paragraphs.push(sentences[0]);
    start = 1;
  }

  const signOffIdx = sentences.findIndex(
    (s, idx) =>
      idx >= start &&
      (/^[A-Z][a-z]+,\s*(Partnerships|Sales|Team)/i.test(s) ||
        /,\s*Partnerships,/i.test(s)),
  );

  const closeIdx = sentences.findIndex(
    (s, idx) => idx >= start && (signOffIdx < 0 || idx < signOffIdx) && /^No worries\b/i.test(s),
  );

  const pitchEnd = closeIdx >= 0 ? closeIdx : signOffIdx >= 0 ? signOffIdx : sentences.length;
  const pitch = sentences.slice(start, pitchEnd).join(" ");
  if (pitch) paragraphs.push(pitch);

  if (closeIdx >= 0) {
    const closeEnd = signOffIdx >= 0 ? signOffIdx : sentences.length;
    const close = sentences.slice(closeIdx, closeEnd).join(" ");
    if (close) paragraphs.push(close);
  }

  if (signOffIdx >= 0) {
    paragraphs.push(sentences.slice(signOffIdx).join(" "));
  } else if (pitchEnd < sentences.length && closeIdx < 0) {
    paragraphs.push(sentences.slice(pitchEnd).join(" "));
  }

  return paragraphs.length > 1 ? paragraphs.join("\n\n") : text;
}

export const EMAIL_BODY_FORMAT_RULE =
  "Format emailBody with blank lines between paragraphs (use \\n\\n): greeting line, pitch paragraph(s), optional soft close, then sign-off.";
