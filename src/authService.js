import { AuthRepository } from "./auth/sqlite/AuthRepository.js";
import { AuthError, extractSessionTokenFromHeaders } from "./auth/sqlite/utils.js";

export const authRepo = new AuthRepository();
export { AuthRepository, AuthError, extractSessionTokenFromHeaders };
