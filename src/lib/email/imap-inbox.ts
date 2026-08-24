import type { ImapFlow } from "imapflow";
import { ImapFlow as ImapFlowClient } from "imapflow";
import type { EmailConfig } from "@/lib/email/config";
import { imapHostForSmtp, resolveSmtpCredentials } from "@/lib/email/config";

export const IMAP_RECENT_UID_LIMIT = 200;
export const IMAP_FETCH_BATCH_SIZE = 40;

type ImapFlowError = Error & {
  responseStatus?: string;
  responseText?: string;
  authenticationFailed?: boolean;
};

export type ImapAccessStatus = {
  configured: boolean;
  hint: string;
  user?: string;
};

export function formatImapPollError(err: unknown, imapHost: string): string {
  const e = err as ImapFlowError;
  const detail = e.responseText?.trim() || e.message?.trim() || String(err);

  if (e.authenticationFailed || /auth/i.test(detail)) {
    return `IMAP login failed for ${imapHost}. Use an app-specific password and confirm IMAP is enabled in your mail settings.`;
  }

  if (detail === "Command failed" || !e.responseText?.trim()) {
    return `IMAP could not read ${imapHost}. Enable IMAP in your mailbox settings and use an app-specific password (not your normal login password).`;
  }

  return `IMAP error (${imapHost}): ${detail}`;
}

export async function verifyImapAccess(config: EmailConfig): Promise<ImapAccessStatus> {
  const creds = resolveSmtpCredentials(config);
  if (!creds.user || !creds.pass) {
    return {
      configured: false,
      hint: "Add your inbox email and App Password to verify reply sync",
      user: creds.user || undefined,
    };
  }

  const imap = imapHostForSmtp(creds.host);
  const client = new ImapFlowClient({
    host: imap.host,
    port: imap.port,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
    disableAutoIdle: true,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.status("INBOX", { messages: true });
    } finally {
      lock.release();
    }
    await client.logout();
    return {
      configured: true,
      hint: `Reply sync verified on ${imap.host}`,
      user: creds.user,
    };
  } catch (err) {
    return {
      configured: false,
      hint: formatImapPollError(err, imap.host),
      user: creds.user,
    };
  }
}

export function trimRecentUids(uids: number[], limit = IMAP_RECENT_UID_LIMIT): number[] {
  if (uids.length <= limit) return uids;
  return uids.slice(-limit);
}

export async function searchRecentInboxUids(client: ImapFlow, since: Date): Promise<number[]> {
  try {
    const uids = await client.search({ since }, { uid: true });
    if (Array.isArray(uids)) return trimRecentUids(uids);
  } catch (e) {
    console.warn("[imap-inbox] SINCE search failed, falling back to ALL", e);
  }

  const all = await client.search({ all: true }, { uid: true });
  if (!Array.isArray(all)) return [];
  return trimRecentUids(all);
}

export function chunkUids(uids: number[], batchSize = IMAP_FETCH_BATCH_SIZE): number[][] {
  const batches: number[][] = [];
  for (let i = 0; i < uids.length; i += batchSize) {
    batches.push(uids.slice(i, i + batchSize));
  }
  return batches;
}
