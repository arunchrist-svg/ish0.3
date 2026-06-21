import { getTavilyKeyConfigIssues, getTavilyKeys } from "./tavily-keys";
import type { TavilyAccountKeyUsage } from "./tavily-account";
import { fetchTavilyAccountUsage, invalidateTavilyAccountUsageCache } from "./tavily-account";

const BASIC_SEARCH_CREDITS = 1;

type KeyUsage = {
  sessionUsed: number;
  lastUsedAt?: number;
};

const sessionByKeyId = new Map<string, KeyUsage>();
const sessionRejectedKeys = new Set<string>();
let activeKeyIndex = 0;

type KeySwitchEvent = {
  fromKeyId: string;
  toKeyId: string | null;
  fromLabel: string;
  toLabel: string | null;
  at: number;
};

let pendingKeySwitch: KeySwitchEvent | null = null;

export function getMonthlyCreditLimit(): number {
  const raw = process.env.TAVILY_MONTHLY_CREDITS;
  const parsed = raw ? parseInt(raw, 10) : 1000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
}

export function recordTavilySearch(keyId: string, credits = BASIC_SEARCH_CREDITS): void {
  const entry = sessionByKeyId.get(keyId) ?? { sessionUsed: 0 };
  entry.sessionUsed += credits;
  entry.lastUsedAt = Date.now();
  sessionByKeyId.set(keyId, entry);
  invalidateTavilyAccountUsageCache();
}

/** Mark key unavailable for this session after a quota rejection (rotation only). */
export function markKeyRejectedForSession(keyId: string): void {
  sessionRejectedKeys.add(keyId);
}

export function syncSessionKeysFromAccount(accountKeys: TavilyAccountKeyUsage[]): void {
  for (const account of accountKeys) {
    if (!account.exhausted) {
      sessionRejectedKeys.delete(account.keyId);
    }
  }
}

function keyLabel(keyId: string): string {
  return getTavilyKeys().find((k) => k.id === keyId)?.label ?? keyId;
}

function recordKeySwitch(fromKeyId: string, toKeyId: string | null): void {
  pendingKeySwitch = {
    fromKeyId,
    toKeyId,
    fromLabel: keyLabel(fromKeyId),
    toLabel: toKeyId ? keyLabel(toKeyId) : null,
    at: Date.now(),
  };
}

export function takeTavilyKeySwitchMessage(): string | null {
  if (!pendingKeySwitch?.toKeyId) {
    pendingKeySwitch = null;
    return null;
  }
  const { fromLabel, toLabel } = pendingKeySwitch;
  pendingKeySwitch = null;
  return `Primary Tavily key exhausted (${fromLabel}) — switched to backup key (${toLabel}).`;
}

export function allTavilyKeysExhausted(accountKeys?: TavilyAccountKeyUsage[]): boolean {
  const keys = getTavilyKeys();
  if (!keys.length) return true;

  if (accountKeys?.length) {
    return accountKeys.every((k) => k.exhausted);
  }

  return keys.every((k) => sessionRejectedKeys.has(k.id));
}

export function getNextTavilyKey(accountKeys?: TavilyAccountKeyUsage[]) {
  const keys = getTavilyKeys();
  if (!keys.length) return null;

  const accountById = new Map(accountKeys?.map((k) => [k.keyId, k]) ?? []);

  for (let i = 0; i < keys.length; i++) {
    const idx = (activeKeyIndex + i) % keys.length;
    const candidate = keys[idx];
    const account = accountById.get(candidate.id);

    if (account?.exhausted) continue;
    if (sessionRejectedKeys.has(candidate.id) && account && !account.exhausted) {
      sessionRejectedKeys.delete(candidate.id);
    }
    if (sessionRejectedKeys.has(candidate.id)) continue;

    activeKeyIndex = idx;
    return candidate;
  }
  return null;
}

export function rotateToNextKey(failedKeyId: string, accountKeys?: TavilyAccountKeyUsage[]) {
  markKeyRejectedForSession(failedKeyId);
  const keys = getTavilyKeys();
  const failedIdx = keys.findIndex((k) => k.id === failedKeyId);
  activeKeyIndex = failedIdx >= 0 ? (failedIdx + 1) % Math.max(keys.length, 1) : 0;
  const next = getNextTavilyKey(accountKeys);
  recordKeySwitch(failedKeyId, next?.id ?? null);
  return next;
}

export type TavilyUsageSnapshot = {
  limitPerKey: number;
  keyCount: number;
  configuredKeyCount: number;
  exhaustedKeyCount: number;
  availableKeyCount: number;
  totalLimit: number;
  totalUsed: number;
  totalRemaining: number;
  sessionUsed: number;
  percentUsed: number;
  activeKeyId: string | null;
  activeKeyLabel: string | null;
  allKeysExhausted: boolean;
  configIssues: string[];
  source: "tavily_account";
  keys: {
    id: string;
    label: string;
    used: number;
    limit: number;
    remaining: number;
    sessionUsed: number;
    exhausted: boolean;
    active: boolean;
    plan: string | null;
    fetchError?: string;
  }[];
};

export async function getTavilyUsageSnapshot(): Promise<TavilyUsageSnapshot> {
  const configured = getTavilyKeys();
  const accountKeys = await fetchTavilyAccountUsage();
  syncSessionKeysFromAccount(accountKeys);
  const active = getNextTavilyKey(accountKeys);

  const accountById = new Map(accountKeys.map((k) => [k.keyId, k]));

  const keyStats = configured.map((k) => {
    const account = accountById.get(k.id);
    const session = sessionByKeyId.get(k.id);
    const used = account?.used ?? 0;
    const limit = account?.limit ?? getMonthlyCreditLimit();
    const exhausted = account?.exhausted ?? false;

    return {
      id: k.id,
      label: k.label,
      used,
      limit,
      remaining: account?.remaining ?? Math.max(0, limit - used),
      sessionUsed: session?.sessionUsed ?? 0,
      exhausted,
      active: active?.id === k.id,
      plan: account?.plan ?? null,
      fetchError: account?.fetchError,
    };
  });

  const totalLimit = keyStats.reduce((sum, k) => sum + k.limit, 0);
  const totalUsed = keyStats.reduce((sum, k) => sum + k.used, 0);
  const sessionUsed = keyStats.reduce((sum, k) => sum + k.sessionUsed, 0);
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const exhaustedKeyCount = keyStats.filter((k) => k.exhausted).length;
  const availableKeyCount = keyStats.length - exhaustedKeyCount;
  const allKeysExhausted = keyStats.length > 0 && exhaustedKeyCount >= keyStats.length;
  const percentUsed = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;

  const configIssues = getTavilyKeyConfigIssues();
  if (allKeysExhausted && keyStats.length === 1) {
    configIssues.push(
      "The key in TAVILY_API_KEY has 0 credits left. Copy your fresh key from app.tavily.com and replace the value in .env.local, then restart dev.",
    );
  }

  return {
    limitPerKey: keyStats[0]?.limit ?? getMonthlyCreditLimit(),
    keyCount: keyStats.length,
    configuredKeyCount: keyStats.length,
    exhaustedKeyCount,
    availableKeyCount,
    totalLimit,
    totalUsed,
    totalRemaining,
    sessionUsed,
    percentUsed,
    activeKeyId: active?.id ?? null,
    activeKeyLabel: active?.label ?? null,
    allKeysExhausted,
    configIssues,
    source: "tavily_account",
    keys: keyStats,
  };
}

/** @deprecated use getTavilyUsageSnapshot — kept for sync callers during migration */
export function markKeyExhausted(keyId: string): void {
  markKeyRejectedForSession(keyId);
}
