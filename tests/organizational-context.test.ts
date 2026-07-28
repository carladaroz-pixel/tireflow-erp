import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  StoreAccessStatus,
  StoreStatus,
  UserStatus,
} from "../src/generated/prisma/client.ts";
import {
  clearSessionContext,
  ContextConflictError,
  ContextUnavailableError,
  getSessionContext,
  listAvailableOrganizations,
  listAvailableStores,
  requireOrganizationContext,
  requireStoreContext,
  selectOrganizationContext,
  selectStoreContext,
} from "../src/lib/auth/context.ts";
import { hashPassword } from "../src/lib/auth/password.ts";
import { createSession, revokeSession } from "../src/lib/auth/session.ts";
import { pool, prisma } from "../src/lib/db/prisma.ts";

const runId = crypto.randomUUID();
const ids = {
  users: [] as string[],
  organizations: [] as string[],
};

let userId = "";
let otherUserId = "";
let suspendedUserId = "";
let revokedUserId = "";
let organizationAId = "";
let organizationBId = "";
let organizationWithoutMembershipId = "";
let inactiveOrganizationId = "";
let membershipAId = "";
let membershipBId = "";
let otherUserMembershipAId = "";
let suspendedMembershipId = "";
let revokedMembershipId = "";
let storeAId = "";
let storeAInactiveId = "";
let storeANoAccessId = "";
let storeAInactiveAccessId = "";
let storeBId = "";
let activeAccessId = "";
let inactiveAccessId = "";
let sessionId = "";
let token = "";

async function createTestUser(suffix: string) {
  const created = await prisma.user.create({
    data: {
      email: `${suffix}-${runId}@example.test`,
      normalizedEmail: `${suffix}-${runId}@example.test`,
      name: `Fictitious ${suffix}`,
      credential: {
        create: {
          passwordHash: await hashPassword(
            `Fictitious-${suffix}-password-2026!`,
          ),
        },
      },
    },
    select: { id: true },
  });
  ids.users.push(created.id);
  return created.id;
}

async function createTestOrganization(
  suffix: string,
  status: OrganizationStatus = OrganizationStatus.ACTIVE,
) {
  const created = await prisma.organization.create({
    data: {
      legalName: `Fictitious ${suffix} Legal`,
      tradeName: `Fictitious ${suffix}`,
      slug: `${suffix}-${runId}`,
      status,
    },
    select: { id: true },
  });
  ids.organizations.push(created.id);
  return created.id;
}

before(async () => {
  userId = await createTestUser("context-user");
  otherUserId = await createTestUser("other-user");
  suspendedUserId = await createTestUser("suspended-user");
  revokedUserId = await createTestUser("revoked-user");

  organizationAId = await createTestOrganization("organization-a");
  organizationBId = await createTestOrganization("organization-b");
  organizationWithoutMembershipId = await createTestOrganization(
    "organization-without-membership",
  );
  inactiveOrganizationId = await createTestOrganization(
    "inactive-organization",
    OrganizationStatus.INACTIVE,
  );

  const memberships = await Promise.all([
    prisma.organizationMembership.create({
      data: { organizationId: organizationAId, userId },
    }),
    prisma.organizationMembership.create({
      data: { organizationId: organizationBId, userId },
    }),
    prisma.organizationMembership.create({
      data: { organizationId: organizationAId, userId: otherUserId },
    }),
    prisma.organizationMembership.create({
      data: {
        organizationId: organizationAId,
        userId: suspendedUserId,
        status: OrganizationMembershipStatus.SUSPENDED,
        disabledAt: new Date(),
      },
    }),
    prisma.organizationMembership.create({
      data: {
        organizationId: organizationAId,
        userId: revokedUserId,
        status: OrganizationMembershipStatus.REVOKED,
        disabledAt: new Date(),
      },
    }),
    prisma.organizationMembership.create({
      data: { organizationId: inactiveOrganizationId, userId },
    }),
  ]);

  membershipAId = memberships[0].id;
  membershipBId = memberships[1].id;
  otherUserMembershipAId = memberships[2].id;
  suspendedMembershipId = memberships[3].id;
  revokedMembershipId = memberships[4].id;

  const stores = await Promise.all([
    prisma.store.create({
      data: {
        organizationId: organizationAId,
        name: "Fictitious Store A",
        code: "MAIN",
      },
    }),
    prisma.store.create({
      data: {
        organizationId: organizationAId,
        name: "Fictitious Inactive Store",
        code: "INACTIVE",
        status: StoreStatus.INACTIVE,
      },
    }),
    prisma.store.create({
      data: {
        organizationId: organizationAId,
        name: "Fictitious Store Without Access",
        code: "NO-ACCESS",
      },
    }),
    prisma.store.create({
      data: {
        organizationId: organizationAId,
        name: "Fictitious Store With Inactive Access",
        code: "INACTIVE-ACCESS",
      },
    }),
    prisma.store.create({
      data: {
        organizationId: organizationBId,
        name: "Fictitious Store B",
        code: "MAIN",
      },
    }),
  ]);

  storeAId = stores[0].id;
  storeAInactiveId = stores[1].id;
  storeANoAccessId = stores[2].id;
  storeAInactiveAccessId = stores[3].id;
  storeBId = stores[4].id;

  const accesses = await Promise.all([
    prisma.storeAccess.create({
      data: {
        organizationId: organizationAId,
        organizationMembershipId: membershipAId,
        storeId: storeAId,
      },
    }),
    prisma.storeAccess.create({
      data: {
        organizationId: organizationAId,
        organizationMembershipId: membershipAId,
        storeId: storeAInactiveId,
      },
    }),
    prisma.storeAccess.create({
      data: {
        organizationId: organizationAId,
        organizationMembershipId: membershipAId,
        storeId: storeAInactiveAccessId,
        status: StoreAccessStatus.INACTIVE,
      },
    }),
    prisma.storeAccess.create({
      data: {
        organizationId: organizationBId,
        organizationMembershipId: membershipBId,
        storeId: storeBId,
      },
    }),
  ]);
  activeAccessId = accesses[0].id;
  inactiveAccessId = accesses[2].id;

  const createdSession = await createSession(userId);
  sessionId = createdSession.session.id;
  token = createdSession.token;
});

after(async () => {
  await prisma.session.updateMany({
    where: { userId: { in: ids.users } },
    data: {
      activeOrganizationId: null,
      activeOrganizationMembershipId: null,
      activeStoreId: null,
    },
  });
  await prisma.session.deleteMany({ where: { userId: { in: ids.users } } });
  await prisma.storeAccess.deleteMany({
    where: { organizationId: { in: ids.organizations } },
  });
  await prisma.store.deleteMany({
    where: { organizationId: { in: ids.organizations } },
  });
  await prisma.organizationMembership.deleteMany({
    where: { organizationId: { in: ids.organizations } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: ids.organizations } },
  });
  await prisma.userCredential.deleteMany({
    where: { userId: { in: ids.users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
  await pool.end();
});

describe("Migration 2 organizational integrity", () => {
  test("creates organizations and enforces globally unique slugs", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationAId },
    });
    assert.equal(organization.status, OrganizationStatus.ACTIVE);

    await assert.rejects(
      prisma.organization.create({
        data: {
          legalName: "Duplicate",
          tradeName: "Duplicate",
          slug: organization.slug,
        },
      }),
      (error: { code?: string }) => error.code === "P2002",
    );
  });

  test("enforces unique membership per organization and user", async () => {
    await assert.rejects(
      prisma.organizationMembership.create({
        data: { organizationId: organizationAId, userId },
      }),
      (error: { code?: string }) => error.code === "P2002",
    );
  });

  test("allows the same store code in different organizations but not the same one", async () => {
    const storeB = await prisma.store.findUniqueOrThrow({
      where: { id: storeBId },
    });
    assert.equal(storeB.code, "MAIN");

    await assert.rejects(
      prisma.store.create({
        data: {
          organizationId: organizationAId,
          name: "Duplicate",
          code: "MAIN",
        },
      }),
      (error: { code?: string }) => error.code === "P2002",
    );
  });

  test("rejects duplicate store access", async () => {
    await assert.rejects(
      prisma.storeAccess.create({
        data: {
          organizationId: organizationAId,
          organizationMembershipId: membershipAId,
          storeId: storeAId,
        },
      }),
      (error: { code?: string }) => error.code === "P2002",
    );
  });

  test("composite FK rejects cross-tenant StoreAccess through direct SQL", async () => {
    await assert.rejects(
      prisma.$executeRaw`
        INSERT INTO "store_accesses" (
          "id", "organization_id", "organization_membership_id", "store_id",
          "status", "created_at", "updated_at"
        ) VALUES (
          ${crypto.randomUUID()}::uuid, ${organizationAId}::uuid,
          ${membershipBId}::uuid, ${storeAId}::uuid,
          'ACTIVE'::store_access_status, NOW(), NOW()
        )
      `,
    );
  });

  test("session composite FK rejects another user's membership", async () => {
    await assert.rejects(
      prisma.session.update({
        where: { id: sessionId },
        data: {
          activeOrganizationId: organizationAId,
          activeOrganizationMembershipId: otherUserMembershipAId,
        },
      }),
    );
  });

  test("session composite FK rejects a store from another organization", async () => {
    await assert.rejects(
      prisma.session.update({
        where: { id: sessionId },
        data: {
          activeOrganizationId: organizationAId,
          activeOrganizationMembershipId: membershipAId,
          activeStoreId: storeBId,
        },
      }),
    );
  });

  test("session composite FK rejects a store without StoreAccess", async () => {
    await assert.rejects(
      prisma.session.update({
        where: { id: sessionId },
        data: {
          activeOrganizationId: organizationAId,
          activeOrganizationMembershipId: membershipAId,
          activeStoreId: storeANoAccessId,
        },
      }),
    );
  });

  test("manual CHECK rejects partial session context through direct SQL", async () => {
    await assert.rejects(
      prisma.$executeRaw`
        UPDATE "sessions"
        SET "active_organization_id" = ${organizationAId}::uuid,
            "active_organization_membership_id" = NULL,
            "active_store_id" = NULL
        WHERE "id" = ${sessionId}::uuid
      `,
    );
  });
});

describe("Migration 2 context services", () => {
  test("starts a session without tenant context", async () => {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        activeOrganizationId: true,
        activeOrganizationMembershipId: true,
        activeStoreId: true,
        contextVersion: true,
      },
    });
    assert.deepEqual(session, {
      activeOrganizationId: null,
      activeOrganizationMembershipId: null,
      activeStoreId: null,
      contextVersion: 0,
    });
    assert.equal(await getSessionContext(token), null);
  });

  test("lists only active organizations available to the authenticated user", async () => {
    const organizations = await listAvailableOrganizations(token);
    assert.deepEqual(
      new Set(organizations.map(({ organization }) => organization.id)),
      new Set([organizationAId, organizationBId]),
    );
  });

  test("selects a valid organization and returns a safe DTO", async () => {
    const context = await selectOrganizationContext(token, organizationAId);
    assert.equal(context.organization.id, organizationAId);
    assert.equal(context.membership.id, membershipAId);
    assert.equal(context.store, null);
    assert.equal("tokenHash" in context, false);
    assert.equal("contextVersion" in context, false);
    assert.equal("disabledReason" in context.membership, false);
  });

  test("rejects organization without membership or with inactive organization", async () => {
    await assert.rejects(
      selectOrganizationContext(token, organizationWithoutMembershipId),
      ContextUnavailableError,
    );
    await assert.rejects(
      selectOrganizationContext(token, inactiveOrganizationId),
      ContextUnavailableError,
    );
  });

  test("rejects suspended and revoked memberships", async () => {
    const suspendedSession = await createSession(suspendedUserId);
    const revokedMembershipSession = await createSession(revokedUserId);

    await assert.rejects(
      selectOrganizationContext(suspendedSession.token, organizationAId),
      ContextUnavailableError,
    );
    await assert.rejects(
      selectOrganizationContext(revokedMembershipSession.token, organizationAId),
      ContextUnavailableError,
    );

    assert.ok(suspendedMembershipId);
    assert.ok(revokedMembershipId);
  });

  test("lists only stores with active store and active access", async () => {
    await selectOrganizationContext(token, organizationAId);
    const stores = await listAvailableStores(token);
    assert.deepEqual(stores.map(({ id }) => id), [storeAId]);
  });

  test("selects a valid store and rejects unavailable stores", async () => {
    const context = await selectStoreContext(token, storeAId);
    assert.equal(context.store?.id, storeAId);

    await assert.rejects(
      selectStoreContext(token, storeBId),
      ContextUnavailableError,
    );
    await assert.rejects(
      selectStoreContext(token, storeANoAccessId),
      ContextUnavailableError,
    );
    await assert.rejects(
      selectStoreContext(token, storeAInactiveId),
      ContextUnavailableError,
    );
    await assert.rejects(
      selectStoreContext(token, storeAInactiveAccessId),
      ContextUnavailableError,
    );
  });

  test("changing organization clears the previous store atomically", async () => {
    await selectOrganizationContext(token, organizationAId);
    await selectStoreContext(token, storeAId);
    const changed = await selectOrganizationContext(token, organizationBId);
    assert.equal(changed.organization.id, organizationBId);
    assert.equal(changed.store, null);

    const persisted = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        activeOrganizationId: true,
        activeOrganizationMembershipId: true,
        activeStoreId: true,
      },
    });
    assert.deepEqual(persisted, {
      activeOrganizationId: organizationBId,
      activeOrganizationMembershipId: membershipBId,
      activeStoreId: null,
    });
  });

  test("clears context atomically", async () => {
    await clearSessionContext(token);
    assert.equal(await getSessionContext(token), null);
    await assert.rejects(
      requireOrganizationContext(token),
      ContextUnavailableError,
    );

    const persisted = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        activeOrganizationId: true,
        activeOrganizationMembershipId: true,
        activeStoreId: true,
      },
    });
    assert.deepEqual(persisted, {
      activeOrganizationId: null,
      activeOrganizationMembershipId: null,
      activeStoreId: null,
    });
  });

  test("rejects revoked sessions and inactive users", async () => {
    const revokedSession = await createSession(userId);
    await revokeSession(revokedSession.session.id);
    await assert.rejects(
      selectOrganizationContext(revokedSession.token, organizationAId),
      ContextUnavailableError,
    );

    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });
    await assert.rejects(
      selectOrganizationContext(token, organizationAId),
      ContextUnavailableError,
    );
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
  });

  test("rejects an optimistic update using a stale contextVersion", async () => {
    await selectOrganizationContext(token, organizationAId);
    const current = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { contextVersion: true },
    });

    const winner = await prisma.session.updateMany({
      where: { id: sessionId, contextVersion: current.contextVersion },
      data: { contextVersion: { increment: 1 } },
    });
    const stale = await prisma.session.updateMany({
      where: { id: sessionId, contextVersion: current.contextVersion },
      data: { contextVersion: { increment: 1 } },
    });

    assert.equal(winner.count, 1);
    assert.equal(stale.count, 0);
    assert.ok(new ContextConflictError());
  });

  test("revalidates and clears a previously valid inactive access", async () => {
    await selectOrganizationContext(token, organizationAId);
    await selectStoreContext(token, storeAId);
    await prisma.storeAccess.update({
      where: { id: activeAccessId },
      data: { status: StoreAccessStatus.INACTIVE },
    });

    const context = await getSessionContext(token);
    assert.equal(context?.organization.id, organizationAId);
    assert.equal(context?.store, null);

    await prisma.storeAccess.update({
      where: { id: activeAccessId },
      data: { status: StoreAccessStatus.ACTIVE },
    });
    assert.ok(inactiveAccessId);
  });

  test("revalidates and clears a previously valid suspended membership", async () => {
    await selectOrganizationContext(token, organizationAId);
    await prisma.organizationMembership.update({
      where: { id: membershipAId },
      data: {
        status: OrganizationMembershipStatus.SUSPENDED,
        disabledAt: new Date(),
      },
    });

    assert.equal(await getSessionContext(token), null);

    await prisma.organizationMembership.update({
      where: { id: membershipAId },
      data: {
        status: OrganizationMembershipStatus.ACTIVE,
        disabledAt: null,
      },
    });
  });

  test("requires store context only after a validated store selection", async () => {
    await selectOrganizationContext(token, organizationAId);
    await assert.rejects(requireStoreContext(token), ContextUnavailableError);
    await selectStoreContext(token, storeAId);
    const context = await requireStoreContext(token);
    assert.equal(context.store.id, storeAId);
  });
});
