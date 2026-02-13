import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-auth-test-"));
const testDbPath = path.join(tmpDir, "auth.db");

let AuthRepository;

before(async () => {
  const mod = await import("../../src/authService.js");
  AuthRepository = mod.authRepo.constructor;
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // no-op
  }
});

describe("AuthRepository", () => {
  it("creates an account, then logs in with password", () => {
    const repo = new AuthRepository(testDbPath);
    const signup = repo.signUpAndIssueSession({
      email: "auth-test@example.com",
      name: "Auth Test",
      password: "supersecure123",
    });

    assert.ok(signup.token);
    assert.equal(signup.user.email, "auth-test@example.com");
    assert.equal(signup.role, "owner");
    assert.ok(signup.workspace.id);

    const signin = repo.loginAndIssueSession({
      email: "auth-test@example.com",
      password: "supersecure123",
    });
    assert.ok(signin.token);
    assert.equal(signin.user.email, "auth-test@example.com");
  });

  it("rejects invalid credentials", () => {
    const repo = new AuthRepository(testDbPath);
    assert.throws(
      () => {
        repo.loginAndIssueSession({
          email: "auth-test@example.com",
          password: "wrong-password",
        });
      },
      (error) => error?.status === 401
    );
  });

  it("rejects duplicate account sign-up", () => {
    const repo = new AuthRepository(testDbPath);
    assert.throws(
      () => {
        repo.signUpAndIssueSession({
          email: "auth-test@example.com",
          name: "Auth Test 2",
          password: "anothersecure123",
        });
      },
      (error) => error?.status === 409
    );
  });

  it("invalidates sessions when membership is removed", () => {
    const repo = new AuthRepository(testDbPath);
    const session = repo.loginAndIssueSession({
      email: "auth-test@example.com",
      password: "supersecure123",
    });
    assert.ok(session.token);

    repo.db
      .prepare("DELETE FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?")
      .run(session.user.id, session.workspace.id);

    const after = repo.getSession(session.token);
    assert.equal(after, null);
  });

  it("links a Firebase identity to an existing email and reuses the same user", () => {
    const repo = new AuthRepository(testDbPath);
    const actor = repo.resolveFirebaseActorFromClaims({
      uid: "firebase_uid_primary",
      email: "auth-test@example.com",
      name: "Firebase Auth Test",
    });

    assert.equal(actor.userEmail, "auth-test@example.com");
    assert.ok(actor.workspaceId);

    const actorAgain = repo.resolveFirebaseActorFromClaims({
      uid: "firebase_uid_primary",
      email: "auth-test@example.com",
      name: "Firebase Auth Test Updated",
    });

    assert.equal(actorAgain.userId, actor.userId);
  });

  it("rejects linking the same email to a different Firebase uid", () => {
    const repo = new AuthRepository(testDbPath);
    assert.throws(
      () => {
        repo.resolveFirebaseActorFromClaims({
          uid: "firebase_uid_conflict",
          email: "auth-test@example.com",
          name: "Other Firebase User",
        });
      },
      (error) => error?.status === 409
    );
  });

  it("creates and accepts workspace invites", () => {
    const repo = new AuthRepository(testDbPath);
    const owner = repo.loginAndIssueSession({
      email: "auth-test@example.com",
      password: "supersecure123",
    });
    const invitee = repo.signUpAndIssueSession({
      email: "invitee@example.com",
      name: "Invitee",
      password: "invitee-pass-123",
    });

    const invite = repo.createWorkspaceInvite({
      workspaceId: owner.workspace.id,
      invitedByUserId: owner.user.id,
      email: invitee.user.email,
      role: "member",
      expiresInHours: 24,
    });
    assert.ok(invite?.token);
    assert.equal(invite.status, "pending");

    const accepted = repo.acceptWorkspaceInvite({
      token: invite.token,
      userId: invitee.user.id,
      userEmail: invitee.user.email,
    });
    assert.equal(accepted.status, "accepted");

    const workspaces = repo.listWorkspacesForUser(invitee.user.id);
    assert.ok(workspaces.some((workspace) => workspace.id === owner.workspace.id));
  });

  it("revokes all sessions for a user", () => {
    const repo = new AuthRepository(testDbPath);
    const session1 = repo.loginAndIssueSession({
      email: "auth-test@example.com",
      password: "supersecure123",
    });
    const session2 = repo.loginAndIssueSession({
      email: "auth-test@example.com",
      password: "supersecure123",
    });
    const result = repo.revokeAllSessionsForUser(session1.user.id);
    assert.ok(result.revoked >= 2);
    assert.equal(repo.getSession(session1.token), null);
    assert.equal(repo.getSession(session2.token), null);
  });
});
