import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  StoreAccessStatus,
  StoreStatus,
  UserStatus,
} from "../src/generated/prisma/client.ts";
import {
  AuthorizationDeniedError,
  getAuthorizationContext,
  requireOrganizationPermission,
  requireStorePermission,
} from "../src/lib/auth/authorization.ts";
import {
  changeMembershipRole,
  grantStoreAccess,
  listOrganizationMemberships,
  reactivateMembership,
  revokeMembership,
  revokeStoreAccess,
  suspendMembership,
  transferOwnership,
} from "../src/lib/auth/membership-admin.ts";
import {
  hasPermission,
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
} from "../src/lib/auth/permissions.ts";
import { clearSessionContext, selectOrganizationContext, selectStoreContext } from "../src/lib/auth/context.ts";
import { createSession, revokeSession } from "../src/lib/auth/session.ts";
import { pool, prisma } from "../src/lib/db/prisma.ts";

const runId = crypto.randomUUID();
const ids = {
  users: [] as string[],
  organizations: [] as string[],
};

type Fixture = {
  userId: string;
  membershipId: string;
  token: string;
};

let organizationAId = "";
let organizationBId = "";
let storeAId = "";
let storeBId = "";
let owner: Fixture;
let secondOwner: Fixture;
let admin: Fixture;
let manager: Fixture;
let operator: Fixture;
let viewer: Fixture;
let outsider: Fixture;
let inactiveTarget: Fixture;

async function createUserWithMembership(
  label: string,
  organizationId: string,
  role: OrganizationRole,
  status: OrganizationMembershipStatus = OrganizationMembershipStatus.ACTIVE,
): Promise<Fixture> {
  const email = `${label}-${runId}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      normalizedEmail: email,
      name: `Fictitious ${label}`,
    },
    select: { id: true },
  });
  ids.users.push(user.id);
  const membership = await prisma.organizationMembership.create({
    data: {
      organizationId,
      userId: user.id,
      role,
      status,
      disabledAt:
        status === OrganizationMembershipStatus.ACTIVE ? null : new Date(),
      disabledReason:
        status === OrganizationMembershipStatus.ACTIVE ? null : "Test fixture",
    },
    select: { id: true },
  });
  const session = await createSession(user.id);
  if (status === OrganizationMembershipStatus.ACTIVE) {
    await selectOrganizationContext(session.token, organizationId);
  }
  return {
    userId: user.id,
    membershipId: membership.id,
    token: session.token,
  };
}

async function setMembership(
  fixture: Fixture,
  data: {
    role?: OrganizationRole;
    status?: OrganizationMembershipStatus;
  },
) {
  await prisma.organizationMembership.update({
    where: { id: fixture.membershipId },
    data: {
      ...data,
      disabledAt:
        data.status && data.status !== OrganizationMembershipStatus.ACTIVE
          ? new Date()
          : data.status === OrganizationMembershipStatus.ACTIVE
            ? null
            : undefined,
      disabledReason:
        data.status && data.status !== OrganizationMembershipStatus.ACTIVE
          ? "Test mutation"
          : data.status === OrganizationMembershipStatus.ACTIVE
            ? null
            : undefined,
    },
  });
}

async function selectOrganization(fixture: Fixture) {
  await selectOrganizationContext(fixture.token, organizationAId);
}

before(async () => {
  const organizations = await Promise.all([
    prisma.organization.create({
      data: {
        legalName: "Fictitious RBAC A Legal",
        tradeName: "Fictitious RBAC A",
        slug: `rbac-a-${runId}`,
      },
    }),
    prisma.organization.create({
      data: {
        legalName: "Fictitious RBAC B Legal",
        tradeName: "Fictitious RBAC B",
        slug: `rbac-b-${runId}`,
      },
    }),
  ]);
  organizationAId = organizations[0].id;
  organizationBId = organizations[1].id;
  ids.organizations.push(organizationAId, organizationBId);

  const stores = await Promise.all([
    prisma.store.create({
      data: {
        organizationId: organizationAId,
        name: "Fictitious RBAC Store A",
        code: "RBAC-A",
      },
    }),
    prisma.store.create({
      data: {
        organizationId: organizationBId,
        name: "Fictitious RBAC Store B",
        code: "RBAC-B",
      },
    }),
  ]);
  storeAId = stores[0].id;
  storeBId = stores[1].id;

  owner = await createUserWithMembership(
    "owner",
    organizationAId,
    OrganizationRole.OWNER,
  );
  secondOwner = await createUserWithMembership(
    "second-owner",
    organizationAId,
    OrganizationRole.OWNER,
  );
  admin = await createUserWithMembership(
    "admin",
    organizationAId,
    OrganizationRole.ADMIN,
  );
  manager = await createUserWithMembership(
    "manager",
    organizationAId,
    OrganizationRole.MANAGER,
  );
  operator = await createUserWithMembership(
    "operator",
    organizationAId,
    OrganizationRole.OPERATOR,
  );
  viewer = await createUserWithMembership(
    "viewer",
    organizationAId,
    OrganizationRole.VIEWER,
  );
  inactiveTarget = await createUserWithMembership(
    "inactive-target",
    organizationAId,
    OrganizationRole.VIEWER,
    OrganizationMembershipStatus.SUSPENDED,
  );
  outsider = await createUserWithMembership(
    "outsider",
    organizationBId,
    OrganizationRole.ADMIN,
  );

  await prisma.storeAccess.createMany({
    data: [
      owner,
      secondOwner,
      admin,
      manager,
      operator,
      viewer,
    ].map((fixture) => ({
      organizationId: organizationAId,
      organizationMembershipId: fixture.membershipId,
      storeId: storeAId,
    })),
  });
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

describe("minimal RBAC permission matrix", () => {
  const expected = {
    [OrganizationRole.OWNER]: PERMISSION_KEYS.filter(
      (permission) => permission !== "records.hard_delete",
    ),
    [OrganizationRole.ADMIN]: PERMISSION_KEYS.filter(
      (permission) =>
        permission !== "records.hard_delete" &&
        permission !== "organization.ownership.transfer",
    ),
    [OrganizationRole.MANAGER]: [
      "records.read",
      "records.create",
      "records.update",
      "records.deactivate",
      "inventory.read",
      "inventory.entry.create",
      "inventory.exit.create",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.history.read",
      "inventory.reverse",
      "costs.read",
      "margins.read",
      "financial.totals.read",
      "operations.cancel",
      "operations.reverse",
      "operations.adjust.approve",
      "reports.read",
      "reports.export",
      "reports.organization.read",
      "organization.members.read",
    ],
    [OrganizationRole.OPERATOR]: [
      "records.read",
      "records.create",
      "records.update",
      "inventory.read",
      "inventory.entry.create",
      "inventory.exit.create",
      "inventory.history.read",
      "reports.read",
    ],
    [OrganizationRole.VIEWER]: [
      "records.read",
      "inventory.read",
      "inventory.history.read",
      "reports.read",
    ],
  } as const;

  for (const role of Object.values(OrganizationRole)) {
    test(`${role} has exactly its documented permissions`, () => {
      assert.deepEqual(
        [...ROLE_PERMISSIONS[role]].sort(),
        [...expected[role]].sort(),
      );
    });
  }

  test("unknown permission and physical deletion are denied", () => {
    for (const role of Object.values(OrganizationRole)) {
      assert.equal(hasPermission(role, "unknown.permission"), false);
      assert.equal(hasPermission(role, "records.hard_delete"), false);
    }
  });

  test("viewer has no writes and operator has no costs", () => {
    assert.equal(hasPermission(OrganizationRole.VIEWER, "records.create"), false);
    assert.equal(hasPermission(OrganizationRole.OPERATOR, "costs.read"), false);
    assert.equal(hasPermission(OrganizationRole.OPERATOR, "margins.read"), false);
  });
});

describe("authorization context and store scope", () => {
  test("returns a safe ephemeral context without session secrets", async () => {
    const context = await getAuthorizationContext(owner.token);
    assert.equal(context.role, OrganizationRole.OWNER);
    assert.equal(context.organization.id, organizationAId);
    assert.equal(context.store, null);
    assert.equal("tokenHash" in context.session, false);
    assert.equal("token" in context.session, false);
    assert.equal("passwordHash" in context.user, false);
  });

  test("rejects invalid or revoked sessions", async () => {
    await assert.rejects(
      getAuthorizationContext("not-a-session-token"),
      AuthorizationDeniedError,
    );
    const session = await createSession(viewer.userId);
    await selectOrganizationContext(session.token, organizationAId);
    await revokeSession(session.session.id);
    await assert.rejects(
      getAuthorizationContext(session.token),
      AuthorizationDeniedError,
    );
  });

  test("revalidates user, organization and membership status", async () => {
    await prisma.user.update({
      where: { id: viewer.userId },
      data: { status: UserStatus.INACTIVE },
    });
    await assert.rejects(
      getAuthorizationContext(viewer.token),
      AuthorizationDeniedError,
    );
    await prisma.user.update({
      where: { id: viewer.userId },
      data: { status: UserStatus.ACTIVE },
    });

    await prisma.organization.update({
      where: { id: organizationAId },
      data: { status: OrganizationStatus.INACTIVE },
    });
    await assert.rejects(
      getAuthorizationContext(viewer.token),
      AuthorizationDeniedError,
    );
    await prisma.organization.update({
      where: { id: organizationAId },
      data: { status: OrganizationStatus.ACTIVE },
    });

    await setMembership(viewer, {
      status: OrganizationMembershipStatus.SUSPENDED,
    });
    await assert.rejects(
      getAuthorizationContext(viewer.token),
      AuthorizationDeniedError,
    );
    await setMembership(viewer, {
      status: OrganizationMembershipStatus.ACTIVE,
    });
  });

  test("a role change takes effect without recreating the session", async () => {
    await setMembership(operator, { role: OrganizationRole.MANAGER });
    const changed = await getAuthorizationContext(operator.token);
    assert.equal(changed.role, OrganizationRole.MANAGER);
    assert.equal(hasPermission(changed.role, "costs.read"), true);
    await setMembership(operator, { role: OrganizationRole.OPERATOR });
  });

  test("organization permission works without a store", async () => {
    const context = await requireOrganizationPermission(
      manager.token,
      "reports.organization.read",
    );
    assert.equal(context.store, null);
  });

  test("store permission requires active store and explicit access", async () => {
    await assert.rejects(
      requireStorePermission(owner.token, "inventory.read"),
      AuthorizationDeniedError,
    );
    await selectStoreContext(owner.token, storeAId);
    const context = await requireStorePermission(owner.token, "inventory.read");
    assert.equal(context.store.id, storeAId);
    await clearSessionContext(owner.token);
    await selectOrganization(owner);
  });

  test("even OWNER is denied without StoreAccess", async () => {
    await prisma.storeAccess.updateMany({
      where: {
        organizationMembershipId: owner.membershipId,
        storeId: storeAId,
      },
      data: { status: StoreAccessStatus.INACTIVE },
    });
    await assert.rejects(
      selectStoreContext(owner.token, storeAId),
      /Context is unavailable/,
    );
    await prisma.storeAccess.updateMany({
      where: {
        organizationMembershipId: owner.membershipId,
        storeId: storeAId,
      },
      data: { status: StoreAccessStatus.ACTIVE },
    });
  });

  test("inactive store and cross-tenant store are denied", async () => {
    await prisma.store.update({
      where: { id: storeAId },
      data: { status: StoreStatus.INACTIVE },
    });
    await assert.rejects(
      selectStoreContext(owner.token, storeAId),
      /Context is unavailable/,
    );
    await prisma.store.update({
      where: { id: storeAId },
      data: { status: StoreStatus.ACTIVE },
    });
    await assert.rejects(
      selectStoreContext(owner.token, storeBId),
      /Context is unavailable/,
    );
  });

  test("revoked StoreAccess invalidates a previously valid context", async () => {
    await selectStoreContext(owner.token, storeAId);
    await prisma.storeAccess.updateMany({
      where: {
        organizationMembershipId: owner.membershipId,
        storeId: storeAId,
      },
      data: { status: StoreAccessStatus.REVOKED, revokedAt: new Date() },
    });
    await assert.rejects(
      requireStorePermission(owner.token, "inventory.read"),
      AuthorizationDeniedError,
    );
    await prisma.storeAccess.updateMany({
      where: {
        organizationMembershipId: owner.membershipId,
        storeId: storeAId,
      },
      data: { status: StoreAccessStatus.ACTIVE, revokedAt: null },
    });
    await clearSessionContext(owner.token);
    await selectOrganization(owner);
  });
});

describe("tenant-aware membership administration", () => {
  test("lists only memberships from the active organization", async () => {
    const memberships = await listOrganizationMemberships(owner.token);
    assert.ok(memberships.some(({ id }) => id === admin.membershipId));
    assert.ok(memberships.every(({ id }) => id !== outsider.membershipId));
    assert.ok(memberships.every((membership) => !("passwordHash" in membership)));
  });

  test("rejects invalid roles and cross-tenant role changes neutrally", async () => {
    await assert.rejects(
      changeMembershipRole(owner.token, viewer.membershipId, "SUPER_ADMIN"),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      changeMembershipRole(
        owner.token,
        outsider.membershipId,
        OrganizationRole.MANAGER,
      ),
      AuthorizationDeniedError,
    );
  });

  test("blocks self elevation, ADMIN ownership changes and MANAGER administration", async () => {
    await assert.rejects(
      changeMembershipRole(admin.token, admin.membershipId, OrganizationRole.OWNER),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      changeMembershipRole(
        admin.token,
        secondOwner.membershipId,
        OrganizationRole.VIEWER,
      ),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      changeMembershipRole(
        manager.token,
        viewer.membershipId,
        OrganizationRole.ADMIN,
      ),
      AuthorizationDeniedError,
    );
  });

  test("allows safe role change by owner and admin within their limits", async () => {
    const changedByOwner = await changeMembershipRole(
      owner.token,
      viewer.membershipId,
      OrganizationRole.OPERATOR,
    );
    assert.equal(changedByOwner.role, OrganizationRole.OPERATOR);
    const changedByAdmin = await changeMembershipRole(
      admin.token,
      viewer.membershipId,
      OrganizationRole.VIEWER,
    );
    assert.equal(changedByAdmin.role, OrganizationRole.VIEWER);
  });

  test("suspends, immediately invalidates, and reactivates a membership", async () => {
    await suspendMembership(owner.token, viewer.membershipId, "Controlled test");
    await assert.rejects(
      getAuthorizationContext(viewer.token),
      AuthorizationDeniedError,
    );
    const reactivated = await reactivateMembership(
      owner.token,
      viewer.membershipId,
    );
    assert.equal(reactivated.status, OrganizationMembershipStatus.ACTIVE);
    await selectOrganization(viewer);
  });

  test("revokes membership and rejects cross-tenant suspension", async () => {
    await revokeMembership(owner.token, viewer.membershipId, "Controlled test");
    await assert.rejects(
      getAuthorizationContext(viewer.token),
      AuthorizationDeniedError,
    );
    await reactivateMembership(owner.token, viewer.membershipId);
    await selectOrganization(viewer);
    await assert.rejects(
      suspendMembership(owner.token, outsider.membershipId, "Cross tenant"),
      AuthorizationDeniedError,
    );
  });

  test("grants and revokes tenant-aware store access", async () => {
    const granted = await grantStoreAccess(
      owner.token,
      inactiveTarget.membershipId,
      storeAId,
    ).catch((error) => error);
    assert.ok(granted instanceof AuthorizationDeniedError);

    await reactivateMembership(owner.token, inactiveTarget.membershipId);
    const active = await grantStoreAccess(
      owner.token,
      inactiveTarget.membershipId,
      storeAId,
    );
    assert.equal(active.status, StoreAccessStatus.ACTIVE);
    const revoked = await revokeStoreAccess(
      owner.token,
      inactiveTarget.membershipId,
      storeAId,
    );
    assert.equal(revoked.status, StoreAccessStatus.REVOKED);

    await assert.rejects(
      grantStoreAccess(owner.token, inactiveTarget.membershipId, storeBId),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      grantStoreAccess(owner.token, outsider.membershipId, storeAId),
      AuthorizationDeniedError,
    );
  });
});

describe("ownership invariants", () => {
  test("blocks demotion, suspension and revocation of the last active owner", async () => {
    await changeMembershipRole(
      owner.token,
      secondOwner.membershipId,
      OrganizationRole.ADMIN,
    );
    await assert.rejects(
      changeMembershipRole(
        secondOwner.token,
        owner.membershipId,
        OrganizationRole.ADMIN,
      ),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      suspendMembership(secondOwner.token, owner.membershipId, "Blocked"),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      revokeMembership(secondOwner.token, owner.membershipId, "Blocked"),
      AuthorizationDeniedError,
    );
    await setMembership(secondOwner, { role: OrganizationRole.OWNER });
  });

  test("permits removing one owner when another active owner remains", async () => {
    const suspended = await suspendMembership(
      owner.token,
      secondOwner.membershipId,
      "Another owner remains",
    );
    assert.equal(suspended.status, OrganizationMembershipStatus.SUSPENDED);
    await reactivateMembership(owner.token, secondOwner.membershipId);
  });

  test("transfers ownership atomically and supports explicit actor demotion", async () => {
    const result = await transferOwnership(owner.token, manager.membershipId, {
      demoteActorTo: OrganizationRole.ADMIN,
    });
    assert.equal(result.target.role, OrganizationRole.OWNER);
    assert.equal(result.actor.role, OrganizationRole.ADMIN);

    const restored = await transferOwnership(
      manager.token,
      owner.membershipId,
      { demoteActorTo: OrganizationRole.MANAGER },
    );
    assert.equal(restored.target.role, OrganizationRole.OWNER);
    await setMembership(manager, { role: OrganizationRole.MANAGER });
  });

  test("rejects transfer by non-owner or to inactive/cross-tenant membership", async () => {
    await setMembership(inactiveTarget, {
      status: OrganizationMembershipStatus.SUSPENDED,
    });
    await assert.rejects(
      transferOwnership(admin.token, viewer.membershipId),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      transferOwnership(owner.token, inactiveTarget.membershipId),
      AuthorizationDeniedError,
    );
    await assert.rejects(
      transferOwnership(owner.token, outsider.membershipId),
      AuthorizationDeniedError,
    );
    await setMembership(inactiveTarget, {
      status: OrganizationMembershipStatus.ACTIVE,
    });
  });

  test("concurrent owner demotions preserve at least one active owner", async () => {
    await setMembership(owner, { role: OrganizationRole.OWNER });
    await setMembership(secondOwner, { role: OrganizationRole.OWNER });
    const results = await Promise.allSettled([
      changeMembershipRole(
        owner.token,
        secondOwner.membershipId,
        OrganizationRole.ADMIN,
      ),
      changeMembershipRole(
        secondOwner.token,
        owner.membershipId,
        OrganizationRole.ADMIN,
      ),
    ]);
    assert.equal(
      results.filter(({ status }) => status === "fulfilled").length,
      1,
    );
    const activeOwners = await prisma.organizationMembership.count({
      where: {
        organizationId: organizationAId,
        status: OrganizationMembershipStatus.ACTIVE,
        role: OrganizationRole.OWNER,
      },
    });
    assert.equal(activeOwners, 1);
    await setMembership(owner, { role: OrganizationRole.OWNER });
    await setMembership(secondOwner, { role: OrganizationRole.OWNER });
  });
});

describe("migration 3 database shape", () => {
  test("uses VIEWER by default and keeps the role required", async () => {
    const email = `default-role-${runId}@example.test`;
    const user = await prisma.user.create({
      data: { email, normalizedEmail: email, name: "Default role test" },
    });
    ids.users.push(user.id);
    const membership = await prisma.organizationMembership.create({
      data: { organizationId: organizationAId, userId: user.id },
    });
    assert.equal(membership.role, OrganizationRole.VIEWER);
  });
});
