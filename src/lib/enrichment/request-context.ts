import { AsyncLocalStorage } from "async_hooks";

export type EnrichmentSecrets = {
  apolloApiKey?: string;
  hunterApiKey?: string;
  prospeoApiKey?: string;
  zintlrAccessToken?: string;
  zintlrSecretKey?: string;
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

export function getProspeoApiKey(): string | undefined {
  return storage.getStore()?.prospeoApiKey?.trim() || process.env.PROSPEO_API_KEY?.trim();
}

export function getZintlrAccessToken(): string | undefined {
  return storage.getStore()?.zintlrAccessToken?.trim() || process.env.ZINTLR_ACCESS_TOKEN?.trim();
}

export function getZintlrSecretKey(): string | undefined {
  return storage.getStore()?.zintlrSecretKey?.trim() || process.env.ZINTLR_SECRET_KEY?.trim();
}
