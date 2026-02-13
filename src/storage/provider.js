import { config } from "../config.js";
import { assertStorageConfig } from "./selectProvider.js";
import { createPostgresProvider } from "./postgresProvider.js";

let cachedProviderPromise = null;

async function buildProvider(resolvedConfig) {
  const { databaseUrl } = assertStorageConfig(resolvedConfig);
  return createPostgresProvider({ databaseUrl });
}

export async function getStorageProvider(overrides = {}) {
  const resolvedConfig = {
    dbProvider: overrides.dbProvider ?? config.dbProvider,
    databaseUrl: overrides.databaseUrl ?? config.databaseUrl,
  };

  return buildProvider(resolvedConfig);
}

export async function getDefaultStorageProvider() {
  if (!cachedProviderPromise) {
    cachedProviderPromise = getStorageProvider();
  }
  return cachedProviderPromise;
}

const defaultProvider = await getDefaultStorageProvider();

export const providerName = defaultProvider.providerName;
export const storageBridgeMode = defaultProvider.storageBridgeMode || "none";
export const noteRepo = defaultProvider.noteRepo;
export const taskRepo = defaultProvider.taskRepo;
export const folderRepo = defaultProvider.folderRepo;
export const authRepo = defaultProvider.authRepo;
