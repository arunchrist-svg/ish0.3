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
  add(process.env.TAVILY_API_KEY_4, "key-4");

  return keys;
}

const NUMBERED_TAVILY_ENV = [
  "TAVILY_API_KEY",
  "TAVILY_API_KEY_2",
  "TAVILY_API_KEY_3",
  "TAVILY_API_KEY_4",
] as const;

export function getTavilyKeyConfigIssues(): string[] {
  const issues: string[] = [];
  const primary = process.env.TAVILY_API_KEY?.trim();
  if (!primary && !process.env.TAVILY_API_KEYS?.trim()) {
    issues.push("TAVILY_API_KEY is missing in .env.local");
  }

  const seen = new Map<string, string>();
  for (const name of NUMBERED_TAVILY_ENV) {
    const raw = process.env[name];
    const value = raw?.trim();
    if (name !== "TAVILY_API_KEY" && raw !== undefined && !value) {
      issues.push(`${name} is blank. Paste a Tavily key after the = sign`);
    }
    if (!value) continue;
    const previous = seen.get(value);
    if (previous) {
      issues.push(`${name} is the same as ${previous}. Use a different key`);
    } else {
      seen.set(value, name);
    }
  }

  return issues;
}

export function hasTavilyKeys(): boolean {
  return getTavilyKeys().length > 0;
}
