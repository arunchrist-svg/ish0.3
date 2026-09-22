/** Swapped per lead in bulk template fill (see writer-bulk-template). */
export const ISH_BULK_FIRST_NAME_TOKEN = "BulkFirstNameRef";

export function resolveIshGreetingName(contactFirstName: string): string {
  const name = contactFirstName?.trim();
  if (!name || name.toLowerCase() === "there") return ISH_BULK_FIRST_NAME_TOKEN;
  return name;
}

export function formatHiGreetingLine(greetingName: string): string {
  const name = greetingName?.trim() || ISH_BULK_FIRST_NAME_TOKEN;
  return `Hi ${name},`;
}
