import { DatabaseSync } from "node:sqlite";
import { config } from "../../config.js";
import { schemaMethods } from "./schemaMethods.js";
import { userWorkspaceMethods } from "./userWorkspaceMethods.js";
import { inviteMethods } from "./inviteMethods.js";
import { sessionSecurityMethods } from "./sessionSecurityMethods.js";

export class AuthRepository {
  constructor(dbPath = config.dbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this._initSchema();
    this._prepareStatements();
    this._ensureDefaultWorkspace();
  }
}

Object.assign(
  AuthRepository.prototype,
  schemaMethods,
  userWorkspaceMethods,
  inviteMethods,
  sessionSecurityMethods
);
