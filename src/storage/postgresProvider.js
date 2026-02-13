import { createPostgresNoteRepo } from "../postgres/noteRepo.js";
import { createPostgresTaskRepo } from "../postgres/taskRepo.js";
import { createPostgresFolderRepo } from "../postgres/folderRepo.js";
import { createPostgresAuthRepo } from "../postgres/authRepo.js";
import { getPostgresPool } from "../postgres/pool.js";

export function createPostgresProvider({ databaseUrl = "" } = {}) {
  const normalizedDatabaseUrl = String(databaseUrl || "").trim();
  if (!normalizedDatabaseUrl) {
    throw new Error("Invalid storage config: DATABASE_URL is required when DB_PROVIDER=postgres");
  }

  const pool = getPostgresPool({ databaseUrl: normalizedDatabaseUrl });

  return {
    noteRepo: createPostgresNoteRepo(pool),
    taskRepo: createPostgresTaskRepo(pool),
    folderRepo: createPostgresFolderRepo(pool),
    authRepo: createPostgresAuthRepo(pool),
    providerName: "postgres",
    storageBridgeMode: "none",
  };
}
