import type { PeopleSearchProvider, SearchProvider } from "./config";

/** Remove stale company-provider messages after switching from Tavily to Places. */
export function filterCompanyNoticesForProvider(
  messages: string[],
  provider: SearchProvider,
): string[] {
  if (provider !== "google_places") return messages;
  return messages.filter((message) => !/tavily|india directories/i.test(message));
}

/** People Off must not show a stale Tavily failure from a previous run. */
export function filterPeopleNoticesForProvider(
  messages: string[],
  provider: PeopleSearchProvider,
): string[] {
  if (provider !== "none") return messages;
  return messages.filter((message) => !/tavily|people search needs/i.test(message));
}
