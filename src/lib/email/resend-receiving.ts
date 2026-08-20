import { getResend } from "@/lib/email/resend-transport";

const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";
const DEFAULT_LIST_LIMIT = 100;

export type ReceivedEmailSummary = {
  id: string;
  from: string;
  to?: string[];
  created_at?: string;
  subject?: string;
  message_id?: string;
};

export type ReceivedEmailDetail = ReceivedEmailSummary & {
  html?: string | null;
  text?: string | null;
};

export type ListReceivedEmailsResult = {
  data: ReceivedEmailSummary[];
  hasMore: boolean;
};

function resendApiKey(apiKey?: string): string {
  const key = apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("Resend API key not configured");
  return key;
}

function receivingErrorMessage(error: unknown): string {
  if (!error) return "Unknown Resend receiving error";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return JSON.stringify(error);
}

async function receivingRest<T>(path: string, apiKey?: string): Promise<T> {
  const key = resendApiKey(apiKey);
  const response = await fetch(`${RESEND_RECEIVING_URL}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend receiving API ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return (await response.json()) as T;
}

export async function listReceivedEmails(
  apiKey?: string,
  options: { limit?: number; after?: string } = {},
): Promise<ListReceivedEmailsResult> {
  const limit = options.limit ?? DEFAULT_LIST_LIMIT;
  const receiving = getResend(apiKey).emails?.receiving;
  if (typeof receiving?.list === "function") {
    const params = options.after ? { limit, after: options.after } : { limit };
    const { data, error } = await receiving.list(params);
    if (error) throw new Error(`Resend receiving list failed: ${receivingErrorMessage(error)}`);
    return {
      data: data?.data ?? [],
      hasMore: Boolean(data?.has_more),
    };
  }

  const query = new URLSearchParams({ limit: String(limit) });
  if (options.after) query.set("after", options.after);
  const payload = await receivingRest<{ data?: ReceivedEmailSummary[]; has_more?: boolean }>(
    `?${query.toString()}`,
    apiKey,
  );
  return {
    data: payload.data ?? [],
    hasMore: Boolean(payload.has_more),
  };
}

export async function getReceivedEmail(
  emailId: string,
  apiKey?: string,
): Promise<ReceivedEmailDetail | null> {
  const id = emailId.trim();
  if (!id) return null;

  const receiving = getResend(apiKey).emails?.receiving;
  if (typeof receiving?.get === "function") {
    const { data, error } = await receiving.get(id);
    if (error) throw new Error(`Resend receiving get failed: ${receivingErrorMessage(error)}`);
    return data ?? null;
  }

  return receivingRest<ReceivedEmailDetail>(`/${encodeURIComponent(id)}`, apiKey);
}
