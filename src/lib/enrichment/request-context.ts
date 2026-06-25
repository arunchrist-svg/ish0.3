import { AsyncLocalStorage } from "async_hooks";

export type EnrichmentSecrets = {
  apolloApiKey?: string;
  hunterApiKey?: string;
};

const storage = new AsyncLocalStorage<EnrichmentSecrets>();

export function runWithEnrichmentSecrets<T>(secrets: EnrichmentSecrets, fn: () => T): T {
  return storage.run(secrets, fn);
}

export async function runWithEnrichmentSecretsAsync<T>(
  secrets: EnrichmentSecrets,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(secrets, fn);
}

export function getApolloApiKey(): string | undefined {
  return storage.getStore()?.apolloApiKey?.trim() || process.env.APOLLO_API_KEY?.trim();
}

export function getHunterApiKey(): string | undefined {
  return storage.getStore()?.hunterApiKey?.trim() || process.env.HUNTER_API_KEY?.trim();
}
