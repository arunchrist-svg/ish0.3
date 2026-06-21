export type TavilyKeyEntry = {
  id: string;
  key: string;
  label: string;
};

function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Collect Tavily keys from env — primary, numbered fallbacks, or comma-separated list. */
export function getTavilyKeys(): TavilyKeyEntry[] {
  const keys: TavilyKeyEntry[] = [];
  const seen = new Set<string>();

  const add = (raw: string | undefined, id: string) => {
    const key = raw?.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push({ id, key, label: maskKey(key) });
  };

  const list = process.env.TAVILY_API_KEYS;
  if (list) {
    list.split(",").forEach((part, i) => add(part, `key-${i + 1}`));
  }

  add(process.env.TAVILY_API_KEY, "key-1");
  add(process.env.TAVILY_API_KEY_2, "key-2");
  add(process.env.TAVILY_API_KEY_3, "key-3");

  return keys;
}

export function getTavilyKeyConfigIssues(): string[] {
  const issues: string[] = [];
  const primary = process.env.TAVILY_API_KEY?.trim();
  const backup = process.env.TAVILY_API_KEY_2?.trim();
  const backupDefined = process.env.TAVILY_API_KEY_2 !== undefined;

  if (!primary) issues.push("TAVILY_API_KEY is missing in .env.local");
  if (backupDefined && !backup) issues.push("TAVILY_API_KEY_2 is blank — paste your backup key after the = sign");
  if (primary && backup && primary === backup) issues.push("TAVILY_API_KEY_2 is the same as TAVILY_API_KEY — add a different backup key");

  return issues;
}

export function hasTavilyKeys(): boolean {
  return getTavilyKeys().length > 0;
}
