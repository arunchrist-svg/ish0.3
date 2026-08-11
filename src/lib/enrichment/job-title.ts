const MONTHS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

const ROLE_HINT =
  /\b(hr|human resources|director|manager|head|vp|vice president|chief|officer|president|lead|leader|consultant|engineer|analyst|executive|founder|co-founder|ceo|cfo|cto|cmo|chro|cpo|coo|admin|administrator|procurement|people|talent|operations|plant|sales|marketing|finance|legal|secretary|partner|associate|specialist|coordinator|supervisor|superintendent|business partner|hrbp)\b/i;

const HONORIFIC = /\b(mr|mrs|ms|shri|smt)\.?\s+[A-Z][a-z]+/i;
const OTHER_PERSON = /\band\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/;
const NOT_A_GIVEN_NAME =
  /^(president|head|chief|director|manager|industrial|legal|people|human|employee|relations|engagement|site|vehicle|chassis|powertrain|lifetime|business|technology|services|watch|division|organization|strategy|process|engineering)$/i;
const URLISH = /https?:\/\/|www\./i;
const NEWSY = /\b(read more|click here|announced|appoints|appointed|joins as)\b/i;

export function sanitizeJobTitle(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const title = raw.replace(/\s+/g, " ").replace(/^[\s,;:\-|–—]+|[\s,;:\-|–—]+$/g, "").trim();
  if (title.length < 2 || title.length > 120) return undefined;
  if (/^i\s+/i.test(title) && !ROLE_HINT.test(title)) return undefined;
  if (/&amp;/i.test(title)) return undefined;
  if (/\bformer\b/i.test(title)) return undefined;
  if (MONTHS.test(title) && /\b(20\d{2}|\d{1,2})\b/.test(title)) return undefined;
  if (HONORIFIC.test(title)) return undefined;
  const otherPerson = title.match(OTHER_PERSON);
  if (
    otherPerson?.[1] &&
    otherPerson[2] &&
    !NOT_A_GIVEN_NAME.test(otherPerson[1]) &&
    !NOT_A_GIVEN_NAME.test(otherPerson[2])
  ) {
    return undefined;
  }
  if (URLISH.test(title)) return undefined;
  if (NEWSY.test(title)) return undefined;
  if (/\bthis\b/i.test(title) && MONTHS.test(title)) return undefined;
  if (!ROLE_HINT.test(title) && title.length > 50) return undefined;
  return title;
}

export function isPlausibleJobTitle(raw?: string | null): boolean {
  return Boolean(sanitizeJobTitle(raw));
}
