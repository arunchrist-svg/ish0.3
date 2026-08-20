/** Browser event: Accounts (/directory) and Contacts should reload from the API. */
export const CRM_RECORDS_REFRESH_EVENT = "crm-records-refresh";

export function notifyCrmRecordsChanged(detail?: {
  source?: string;
  savedLeads?: number;
  savedAccounts?: number;
}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CRM_RECORDS_REFRESH_EVENT, { detail }));
}

export function subscribeCrmRecordsRefresh(onRefresh: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onRefresh();
  window.addEventListener(CRM_RECORDS_REFRESH_EVENT, handler);
  return () => window.removeEventListener(CRM_RECORDS_REFRESH_EVENT, handler);
}
