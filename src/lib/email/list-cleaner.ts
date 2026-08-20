/**
 * Recipient list cleaning before outreach sends.
 *
 * Always: format validation + MX lookup.
 * Optional (EMAIL_RCPT_PROBE=1): SMTP RCPT TO handshake against the domain MX
 * to catch hard rejects and crude catch-all domains. Off by default (many ESPs
 * block outbound port 25 / treat probes as abuse).
 */

import { promises as dns } from "node:dns";
import net from "node:net";
import { mapWithConcurrency } from "@/lib/async";
import { isValidEmail, sanitizeEmail } from "@/lib/enrichment/validate-contact";

export type CleanReason =
  | "invalid_format"
  | "no_mx"
  | "catch_all"
  | "rejected"
  | "probe_disabled"
  | "probe_error";

export type CleanResult = {
  email: string;
  ok: boolean;
  /** Soft catch-all warning: address may still be deliverable */
  warning?: boolean;
  reason?: CleanReason;
  detail?: string;
};

const mxCache = new Map<string, Promise<string[]>>();
const cleanCache = new Map<string, Promise<CleanResult>>();

function rcptProbeEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  return process.env.EMAIL_RCPT_PROBE === "1";
}

async function resolveMxHosts(domain: string): Promise<string[]> {
  const key = domain.toLowerCase();
  const cached = mxCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const records = await dns.resolveMx(domain);
      return records
        .sort((a, b) => a.priority - b.priority)
        .map((r) => r.exchange)
        .filter(Boolean);
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code === "ENOTFOUND" || code === "ENODATA" || code === "ENOTIMP") {
        return [];
      }
      throw err;
    }
  })();
  mxCache.set(key, promise);
  return promise;
}

function readSmtpLine(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP read timeout"));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (/\r?\n/.test(buffer)) {
        cleanup();
        resolve(buffer.trim());
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(
  socket: net.Socket,
  command: string | null,
  timeoutMs: number,
): Promise<{ code: number; raw: string }> {
  if (command) socket.write(`${command}\r\n`);
  const raw = await readSmtpLine(socket, timeoutMs);
  const code = parseInt(raw.slice(0, 3), 10);
  return { code: Number.isFinite(code) ? code : 0, raw };
}

/**
 * Minimal SMTP dialogue: banner → HELO → MAIL FROM → RCPT TO → RSET/QUIT.
 * Returns SMTP reply code for RCPT TO (250 accept, 550 reject, etc.).
 */
export async function probeRcptTo(params: {
  mxHost: string;
  recipient: string;
  mailFrom?: string;
  timeoutMs?: number;
}): Promise<number> {
  const timeoutMs = params.timeoutMs ?? 8_000;
  const mailFrom = params.mailFrom ?? "probe@localhost";

  return new Promise((resolve, reject) => {
    const socket = net.connect(25, params.mxHost);
    socket.setTimeout(timeoutMs);

    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.once("timeout", () => fail(new Error("SMTP connect timeout")));
    socket.once("error", fail);

    void (async () => {
      try {
        await smtpCommand(socket, null, timeoutMs);
        await smtpCommand(socket, "HELO ish-list-cleaner.local", timeoutMs);
        await smtpCommand(socket, `MAIL FROM:<${mailFrom}>`, timeoutMs);
        const rcpt = await smtpCommand(socket, `RCPT TO:<${params.recipient}>`, timeoutMs);
        try {
          await smtpCommand(socket, "RSET", timeoutMs);
          await smtpCommand(socket, "QUIT", timeoutMs);
        } catch {
          // ignore teardown errors
        }
        socket.destroy();
        resolve(rcpt.code);
      } catch (err) {
        socket.destroy();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

async function runRcptProbe(email: string, mxHosts: string[]): Promise<{
  rejected: boolean;
  catchAll: boolean;
  detail?: string;
}> {
  const domain = email.split("@")[1] ?? "";
  const fake = `ish-probe-${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@${domain}`;
  let lastError: string | undefined;

  for (const host of mxHosts.slice(0, 2)) {
    try {
      const realCode = await probeRcptTo({ mxHost: host, recipient: email });
      if (realCode >= 500 && realCode < 600) {
        return { rejected: true, catchAll: false, detail: `RCPT ${realCode} from ${host}` };
      }
      if (realCode < 200 || realCode >= 400) {
        lastError = `Unexpected RCPT ${realCode} from ${host}`;
        continue;
      }

      const fakeCode = await probeRcptTo({ mxHost: host, recipient: fake });
      const catchAll = fakeCode >= 200 && fakeCode < 400;
      return { rejected: false, catchAll, detail: catchAll ? `catch-all on ${host}` : undefined };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return { rejected: false, catchAll: false, detail: lastError };
}

export async function cleanEmailAddress(
  email: string,
  opts?: { rcptProbe?: boolean },
): Promise<CleanResult> {
  const normalized = sanitizeEmail(email) ?? email.trim().toLowerCase();
  if (!normalized || !isValidEmail(normalized)) {
    return { email: normalized || email, ok: false, reason: "invalid_format" };
  }

  const probe = rcptProbeEnabled(opts?.rcptProbe);
  const cacheKey = `${normalized}|probe=${probe ? 1 : 0}`;
  const cached = cleanCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<CleanResult> => {
    const domain = normalized.split("@")[1] ?? "";
    let mxHosts: string[];
    try {
      mxHosts = await resolveMxHosts(domain);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn("[list-cleaner] MX lookup unavailable, not blocking send", detail);
      return { email: normalized, ok: true, reason: "probe_error", detail };
    }
    if (!mxHosts.length) {
      return { email: normalized, ok: false, reason: "no_mx" };
    }

    if (!probe) {
      return { email: normalized, ok: true, reason: "probe_disabled" };
    }

    const probed = await runRcptProbe(normalized, mxHosts);
    if (probed.rejected) {
      return { email: normalized, ok: false, reason: "rejected", detail: probed.detail };
    }
    if (probed.catchAll) {
      // Soft warning: still ok to send, but flag for operators
      return {
        email: normalized,
        ok: true,
        warning: true,
        reason: "catch_all",
        detail: probed.detail,
      };
    }
    if (probed.detail && !probed.rejected) {
      // Probe failed open (network); do not block send
      return {
        email: normalized,
        ok: true,
        reason: "probe_error",
        detail: probed.detail,
      };
    }
    return { email: normalized, ok: true };
  })();

  cleanCache.set(cacheKey, promise);
  try {
    return await promise;
  } catch (err) {
    cleanCache.delete(cacheKey);
    throw err;
  }
}

export async function cleanEmailBatch(
  emails: string[],
  concurrency = 4,
  opts?: { rcptProbe?: boolean },
): Promise<CleanResult[]> {
  return mapWithConcurrency(emails, concurrency, (email) => cleanEmailAddress(email, opts));
}

/** Test helpers */
export function _resetListCleanerCachesForTests() {
  mxCache.clear();
  cleanCache.clear();
}
