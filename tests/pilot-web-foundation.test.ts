import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { OrganizationRole, StoreAccessStatus } from "../src/generated/prisma/client.ts";
import {
  bootstrapPilot,
  readPilotBootstrapConfig,
} from "../src/lib/bootstrap/pilot.ts";
import {
  SESSION_COOKIE_BASE,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth/web-session-policy.ts";
import { pool, prisma } from "../src/lib/db/prisma.ts";

const runId = crypto.randomUUID();
const email = `pilot-test-${runId}@example.test`;
const slug = `pilot-test-${runId}`;
const config = {
  adminName: "Fictitious Pilot Admin",
  adminEmail: email,
  adminPassword: "Fictitious-pilot-password-2026!",
  organizationName: "Fictitious Pilot Organization",
  organizationSlug: slug,
  storeName: "Fictitious Main Store",
  storeCode: "MAIN",
};

after(async () => {
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  const user = await prisma.user.findUnique({
    where: { normalizedEmail: email },
    select: { id: true },
  });
  if (organization) {
    await prisma.session.updateMany({
      where: { activeOrganizationId: organization.id },
      data: {
        activeOrganizationId: null,
        activeOrganizationMembershipId: null,
        activeStoreId: null,
      },
    });
    await prisma.storeAccess.deleteMany({ where: { organizationId: organization.id } });
    await prisma.store.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.userCredential.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
  await pool.end();
});

describe("pilot bootstrap", () => {
  test("fails neutrally when required variables are missing", () => {
    assert.throws(
      () => readPilotBootstrapConfig({} as NodeJS.ProcessEnv),
      /BOOTSTRAP_ADMIN_NAME is required/,
    );
  });

  test("creates the complete pilot identity and reuses it idempotently", async () => {
    const first = await bootstrapPilot(config);
    const second = await bootstrapPilot(config);
    assert.deepEqual(second, first);

    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { id: first.membershipId },
      select: { role: true },
    });
    const access = await prisma.storeAccess.findUniqueOrThrow({
      where: { id: first.storeAccessId },
      select: { status: true },
    });
    assert.equal(membership.role, OrganizationRole.OWNER);
    assert.equal(access.status, StoreAccessStatus.ACTIVE);
    assert.equal(await prisma.user.count({ where: { normalizedEmail: email } }), 1);
    assert.equal(await prisma.organization.count({ where: { slug } }), 1);
  });

  test("repairs missing StoreAccess without exposing password or hash", async () => {
    const existing = await bootstrapPilot(config);
    await prisma.storeAccess.delete({ where: { id: existing.storeAccessId } });
    const repaired = await bootstrapPilot(config);
    assert.ok(repaired.storeAccessId);
    assert.equal("password" in repaired, false);
    assert.equal("passwordHash" in repaired, false);
  });
});

describe("web session policy", () => {
  test("uses a stable HttpOnly Lax site-wide cookie", () => {
    assert.equal(SESSION_COOKIE_NAME, "tireflow_session");
    assert.equal(SESSION_COOKIE_BASE.httpOnly, true);
    assert.equal(SESSION_COOKIE_BASE.sameSite, "lax");
    assert.equal(SESSION_COOKIE_BASE.path, "/");
  });
});
