export type TavilyKeyEntry = {
  id: string;
  key: string;
  label: string;
};

/** Always probe this many numbered slots so .env stubs and Next inlining stay reliable. */
const NUMBERED_PROBE_MAX = 32;

function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

function numberedEnvName(n: number): string {
  return n === 1 ? "TAVILY_API_KEY" : `TAVILY_API_KEY_${n}`;
}

/**
 * Discover numbered Tavily env vars: TAVILY_API_KEY, TAVILY_API_KEY_2, ... TAVILY_API_KEY_N.
 * Probes 1..32 and also any higher TAVILY_API_KEY_* present on process.env so keys
 * can be added without a code change.
 */
export function listNumberedTavilyEnvEntries(): { n: number; name: string; raw: string | undefined }[] {
  const byN = new Map<number, { name: string; raw: string | undefined }>();

  for (let n = 1; n <= NUMBERED_PROBE_MAX; n++) {
    const name = numberedEnvName(n);
    byN.set(n, { name, raw: process.env[name] });
  }

  for (const name of Object.keys(process.env)) {
    const match = /^TAVILY_API_KEY_(\d+)$/.exec(name);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (!Number.isFinite(n) || n < 1) continue;
    byN.set(n, { name, raw: process.env[name] });
  }

  return [...byN.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, entry]) => ({ n, name: entry.name, raw: entry.raw }));
}

/** Collect Tavily keys from env: numbered keys and/or a comma-separated TAVILY_API_KEYS list. */
export function getTavilyKeys(): TavilyKeyEntry[] {
  const keys: TavilyKeyEntry[] = [];
  const seen = new Set<string>();
  let maxN = 0;

  const add = (raw: string | undefined, id: string) => {
    const key = raw?.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push({ id, key, label: maskKey(key) });
  };

  for (const entry of listNumberedTavilyEnvEntries()) {
    const value = entry.raw?.trim();
    if (!value) continue;
    add(value, `key-${entry.n}`);
    maxN = Math.max(maxN, entry.n);
  }

  const list = process.env.TAVILY_API_KEYS;
  if (list?.trim()) {
    let next = Math.max(maxN, 0) + 1;
    for (const part of list.split(",")) {
      const before = keys.length;
      add(part, `key-${next}`);
      if (keys.length > before) next += 1;
    }
  }

  return keys;
}

export function getTavilyKeyConfigIssues(): string[] {
  const issues: string[] = [];
  if (!getTavilyKeys().length) {
    issues.push("TAVILY_API_KEY is missing in .env.local (or set TAVILY_API_KEYS)");
  }

  const seen = new Map<string, string>();
  for (const entry of listNumberedTavilyEnvEntries()) {
    const value = entry.raw?.trim();
    if (entry.name !== "TAVILY_API_KEY" && entry.raw !== undefined && !value) {
      issues.push(`${entry.name} is blank. Paste a Tavily key after the = sign`);
    }
    if (!value) continue;
    const previous = seen.get(value);
    if (previous) {
      issues.push(`${entry.name} is the same as ${previous}. Use a different key`);
    } else {
      seen.set(value, entry.name);
    }
  }

  const list = process.env.TAVILY_API_KEYS?.trim();
  if (list) {
    for (const part of list.split(",")) {
      const value = part.trim();
      if (!value) continue;
      const previous = seen.get(value);
      if (previous) {
        issues.push(`TAVILY_API_KEYS contains a duplicate of ${previous}. Use a different key`);
      } else {
        seen.set(value, "TAVILY_API_KEYS");
      }
    }
  }

  return issues;
}

export function hasTavilyKeys(): boolean {
  return getTavilyKeys().length > 0;
}
