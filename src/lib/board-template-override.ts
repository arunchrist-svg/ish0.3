let _templateId: string | null = null;

export function getBoardTemplateOverride(): string | null {
  return _templateId;
}

export function setBoardTemplateOverride(id: string | null): void {
  _templateId = id;
}
