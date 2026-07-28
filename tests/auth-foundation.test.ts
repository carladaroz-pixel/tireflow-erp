import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";

import { UserStatus } from "../src/generated/prisma/client.ts";
import { authenticateWithPassword } from "../src/lib/auth/authenticate.ts";
import { normalizeEmail } from "../src/lib/auth/email.ts";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from "../src/lib/auth/password.ts";
import {
  createSession,
  revokeAllUserSessions,
  revokeSession,
  validateSession,
} from "../src/lib/auth/session.ts";
import {
  generateSessionToken,
  hashSessionToken,
} from "../src/lib/auth/session-token.ts";
import { pool, prisma } from "../src/lib/db/prisma.ts";

const testEmail = `migration-1-${crypto.randomUUID()}@example.test`;
let userId = "";

before(async () => {
  const passwordHash = await hashPassword("Fictitious-test-password-2026!");
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      normalizedEmail: normalizeEmail(testEmail),
      name: "Fictitious Migration Test",
      credential: {
        create: {
          passwordHash,
        },
      },
    },
    select: { id: true },
  });
  userId = user.id;
});

after(async () => {
  if (userId) {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.userCredential.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
  await pool.end();
});

describe("identity security primitives", () => {
  test("normalizes email without trusting client casing or whitespace", () => {
    assert.equal(normalizeEmail("  CARLA@Example.COM  "), "carla@example.com");
  });

  test("hashes and verifies a valid password", async () => {
    const hash = await hashPassword("Correct-test-password-2026!");
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(
      await verifyPassword("Correct-test-password-2026!", hash),
      true,
    );
    assert.equal(await verifyPassword("Wrong-test-password-2026!", hash), false);
  });

  test("uses a dummy hash for an unknown user and returns a neutral result", async () => {
    assert.equal(
      await verifyPasswordOrDummy("Unknown-test-password-2026!", null),
      false,
    );
    assert.equal(
      await authenticateWithPassword(
        `missing-${crypto.randomUUID()}@example.test`,
        "Unknown-test-password-2026!",
      ),
      null,
    );
  });

  test("authenticates an active user without returning its credential hash", async () => {
    const authenticated = await authenticateWithPassword(
      testEmail,
      "Fictitious-test-password-2026!",
    );
    assert.ok(authenticated);
    assert.equal("passwordHash" in authenticated, false);
  });

  test("generates a 256-bit opaque token and stores only its hash", async () => {
    const token = generateSessionToken();
    assert.equal(Buffer.from(token, "base64url").byteLength, 32);

    const created = await createSession(userId);
    const persisted = await prisma.session.findUniqueOrThrow({
      where: { id: created.session.id },
      select: { tokenHash: true },
    });
    assert.notEqual(persisted.tokenHash, created.token);
    assert.equal(persisted.tokenHash, hashSessionToken(created.token));
    assert.equal("tokenHash" in created.session, false);
  });

  test("creates and validates multiple sessions without exposing hashes", async () => {
    const first = await createSession(userId);
    const second = await createSession(userId);

    assert.notEqual(first.session.id, second.session.id);
    assert.ok(await validateSession(first.token));
    assert.ok(await validateSession(second.token));
    assert.equal("passwordHash" in first.session.user, false);
    assert.equal("tokenHash" in first.session, false);
  });

  test("rejects expired and individually revoked sessions", async () => {
    const now = new Date();
    const expired = await createSession(userId, {
      now: new Date(now.getTime() - 120_000),
      absoluteTtlMs: 60_000,
      idleTtlMs: 60_000,
    });
    assert.equal(await validateSession(expired.token, now), null);

    const revoked = await createSession(userId);
    await revokeSession(revoked.session.id);
    assert.equal(await validateSession(revoked.token), null);
  });

  test("revokes every active session for one user", async () => {
    const first = await createSession(userId);
    const second = await createSession(userId);
    const count = await revokeAllUserSessions(userId);

    assert.ok(count >= 2);
    assert.equal(await validateSession(first.token), null);
    assert.equal(await validateSession(second.token), null);
  });

  test("prevents an inactive user from authenticating or creating sessions", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });

    assert.equal(
      await authenticateWithPassword(
        testEmail,
        "Fictitious-test-password-2026!",
      ),
      null,
    );
    await assert.rejects(() => createSession(userId), /Authentication failed/);

    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
  });

  test("keeps global identity tenant-free and limits Session to approved context fields", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const userModel = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? "";
    const credentialModel =
      schema.match(/model UserCredential \{[\s\S]*?\n\}/)?.[0] ?? "";
    const sessionModel =
      schema.match(/model Session \{[\s\S]*?\n\}/)?.[0] ?? "";
    const forbiddenIdentityFields = [
      "organizationId",
      "membershipId",
      "storeId",
      "activeOrganizationId",
      "activeMembershipId",
      "activeStoreId",
    ];
    for (const field of forbiddenIdentityFields) {
      assert.doesNotMatch(userModel, new RegExp(`\\b${field}\\b`));
      assert.doesNotMatch(credentialModel, new RegExp(`\\b${field}\\b`));
    }
    assert.match(sessionModel, /\bactiveOrganizationId\b/);
    assert.match(sessionModel, /\bactiveOrganizationMembershipId\b/);
    assert.match(sessionModel, /\bactiveStoreId\b/);
    assert.match(sessionModel, /\bcontextUpdatedAt\b/);
    assert.match(sessionModel, /\bcontextVersion\b/);
  });
});
