const STORAGE_KEY = "ish-board-write-template";

let _templateId: string | null = null;

function readStoredTemplate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getBoardTemplateOverride(): string | null {
  if (_templateId) return _templateId;
  const stored = readStoredTemplate();
  if (stored) _templateId = stored;
  return _templateId;
}

export function setBoardTemplateOverride(id: string | null): void {
  _templateId = id;
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
