import { z } from "zod";

import {
  OrganizationMembershipStatus,
  OrganizationRole,
  Prisma,
  StoreAccessStatus,
  StoreStatus,
} from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import {
  AuthorizationDeniedError,
  getAuthorizationContextInTransaction,
  requirePermission,
  type AuthorizationContext,
  type AuthorizationTransaction,
} from "./authorization";

const uuidSchema = z.string().uuid();
const roleSchema = z.nativeEnum(OrganizationRole);
const reasonSchema = z.string().trim().min(1).max(240);

const roleRank: Readonly<Record<OrganizationRole, number>> = {
  [OrganizationRole.OWNER]: 5,
  [OrganizationRole.ADMIN]: 4,
  [OrganizationRole.MANAGER]: 3,
  [OrganizationRole.OPERATOR]: 2,
  [OrganizationRole.VIEWER]: 1,
};

const membershipSelect = {
  id: true,
  status: true,
  role: true,
  joinedAt: true,
  disabledAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  storeAccesses: {
    where: { status: StoreAccessStatus.ACTIVE },
    select: {
      id: true,
      status: true,
      store: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;

export type OrganizationMembershipDto =
  Prisma.OrganizationMembershipGetPayload<{
    select: typeof membershipSelect;
  }>;

function deny(): never {
  throw new AuthorizationDeniedError();
}

function parseUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) deny();
  return parsed.data;
}

async function serializableTransaction<T>(
  operation: (tx: AuthorizationTransaction) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2034"
    ) {
      deny();
    }
    throw error;
  }
}

async function authorizationForMutation(
  tx: AuthorizationTransaction,
  opaqueToken: string,
  permission:
    | "organization.members.role.update"
    | "organization.members.suspend"
    | "organization.members.reactivate"
    | "organization.members.remove"
    | "stores.access.grant"
    | "stores.access.revoke",
): Promise<AuthorizationContext> {
  const context = await getAuthorizationContextInTransaction(tx, opaqueToken);
  requirePermission(context, permission);
  return context;
}

async function findTarget(
  tx: AuthorizationTransaction,
  organizationId: string,
  targetMembershipId: string,
) {
  const target = await tx.organizationMembership.findFirst({
    where: {
      id: parseUuid(targetMembershipId),
      organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      status: true,
      role: true,
    },
  });
  if (!target) deny();
  return target;
}

function canManageTarget(
  actor: AuthorizationContext,
  target: { id: string; role: OrganizationRole },
): void {
  if (actor.membership.id === target.id) deny();
  if (actor.role === OrganizationRole.ADMIN) {
    if (
      target.role === OrganizationRole.OWNER ||
      target.role === OrganizationRole.ADMIN
    ) {
      deny();
    }
    return;
  }
  if (actor.role !== OrganizationRole.OWNER) deny();
}

function canAssignRole(
  actor: AuthorizationContext,
  target: { id: string; role: OrganizationRole },
  requestedRole: OrganizationRole,
): void {
  canManageTarget(actor, target);
  if (requestedRole === OrganizationRole.OWNER) deny();
  if (roleRank[requestedRole] > roleRank[actor.role]) deny();
}

async function acquireOrganizationOwnerLock(
  tx: AuthorizationTransaction,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      (('x' || substr(replace(${organizationId}::text, '-', ''), 1, 8))::bit(32)::int),
      (('x' || substr(replace(${organizationId}::text, '-', ''), 9, 8))::bit(32)::int)
    )
  `;
}

async function lockOwners(
  tx: AuthorizationTransaction,
  organizationId: string,
): Promise<Array<{ id: string; status: OrganizationMembershipStatus }>> {
  return tx.$queryRaw`
    SELECT "id", "status"
    FROM "organization_memberships"
    WHERE "organization_id" = ${organizationId}::uuid
      AND "role" = 'OWNER'::organization_role
    FOR UPDATE
  `;
}

async function assertActorIsActiveOwner(
  tx: AuthorizationTransaction,
  organizationId: string,
  actorMembershipId: string,
): Promise<void> {
  const actor = await tx.organizationMembership.findFirst({
    where: {
      id: actorMembershipId,
      organizationId,
      status: OrganizationMembershipStatus.ACTIVE,
      role: OrganizationRole.OWNER,
      organization: {
        status: "ACTIVE",
      },
    },
    select: { id: true },
  });
  if (!actor) deny();
}

async function assertActiveOwnerRemains(
  tx: AuthorizationTransaction,
  organizationId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS "count"
    FROM "organization_memberships"
    WHERE "organization_id" = ${organizationId}::uuid
      AND "role" = 'OWNER'::organization_role
      AND "status" = 'ACTIVE'::organization_membership_status
  `;
  if (rows[0]?.count < BigInt(1)) deny();
}

async function clearMembershipSessionContexts(
  tx: AuthorizationTransaction,
  organizationId: string,
  membershipId: string,
): Promise<void> {
  await tx.session.updateMany({
    where: {
      activeOrganizationId: organizationId,
      activeOrganizationMembershipId: membershipId,
    },
    data: {
      activeOrganizationId: null,
      activeOrganizationMembershipId: null,
      activeStoreId: null,
      contextUpdatedAt: new Date(),
      contextVersion: { increment: 1 },
    },
  });
}

export async function listOrganizationMemberships(
  opaqueToken: string,
): Promise<OrganizationMembershipDto[]> {
  return prisma.$transaction(async (tx) => {
    const context = await getAuthorizationContextInTransaction(tx, opaqueToken);
    requirePermission(context, "organization.members.read");
    return tx.organizationMembership.findMany({
      where: { organizationId: context.organization.id },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      select: membershipSelect,
    });
  });
}

export async function changeMembershipRole(
  opaqueToken: string,
  targetMembershipId: string,
  requestedRoleInput: unknown,
): Promise<OrganizationMembershipDto> {
  const parsedRole = roleSchema.safeParse(requestedRoleInput);
  if (!parsedRole.success) deny();
  const requestedRole = parsedRole.data;
  return serializableTransaction(
    async (tx) => {
      const actor = await authorizationForMutation(
        tx,
        opaqueToken,
        "organization.members.role.update",
      );
      const target = await findTarget(
        tx,
        actor.organization.id,
        targetMembershipId,
      );
      if (target.status !== OrganizationMembershipStatus.ACTIVE) deny();
      canAssignRole(actor, target, requestedRole);

      if (target.role === OrganizationRole.OWNER) {
        await acquireOrganizationOwnerLock(tx, actor.organization.id);
        await lockOwners(tx, actor.organization.id);
        await assertActorIsActiveOwner(
          tx,
          actor.organization.id,
          actor.membership.id,
        );
      }
      const updated = await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: requestedRole },
        select: membershipSelect,
      });
      if (target.role === OrganizationRole.OWNER) {
        await assertActiveOwnerRemains(tx, actor.organization.id);
      }
      return updated;
    },
  );
}

async function changeMembershipStatus(
  opaqueToken: string,
  targetMembershipId: string,
  status: OrganizationMembershipStatus,
  permission:
    | "organization.members.suspend"
    | "organization.members.reactivate"
    | "organization.members.remove",
  reason?: string,
): Promise<OrganizationMembershipDto> {
  return serializableTransaction(
    async (tx) => {
      const actor = await authorizationForMutation(tx, opaqueToken, permission);
      const target = await findTarget(
        tx,
        actor.organization.id,
        targetMembershipId,
      );
      canManageTarget(actor, target);
      if (target.role === OrganizationRole.OWNER) {
        await acquireOrganizationOwnerLock(tx, actor.organization.id);
        await lockOwners(tx, actor.organization.id);
        await assertActorIsActiveOwner(
          tx,
          actor.organization.id,
          actor.membership.id,
        );
      }
      const updated = await tx.organizationMembership.update({
        where: { id: target.id },
        data: {
          status,
          disabledAt:
            status === OrganizationMembershipStatus.ACTIVE ? null : new Date(),
          disabledReason:
            status === OrganizationMembershipStatus.ACTIVE
              ? null
              : reasonSchema.parse(reason),
        },
        select: membershipSelect,
      });
      if (status !== OrganizationMembershipStatus.ACTIVE) {
        await clearMembershipSessionContexts(
          tx,
          actor.organization.id,
          target.id,
        );
      }
      if (target.role === OrganizationRole.OWNER) {
        await assertActiveOwnerRemains(tx, actor.organization.id);
      }
      return updated;
    },
  );
}

export function suspendMembership(
  opaqueToken: string,
  targetMembershipId: string,
  reason: string,
): Promise<OrganizationMembershipDto> {
  return changeMembershipStatus(
    opaqueToken,
    targetMembershipId,
    OrganizationMembershipStatus.SUSPENDED,
    "organization.members.suspend",
    reason,
  );
}

export function reactivateMembership(
  opaqueToken: string,
  targetMembershipId: string,
): Promise<OrganizationMembershipDto> {
  return changeMembershipStatus(
    opaqueToken,
    targetMembershipId,
    OrganizationMembershipStatus.ACTIVE,
    "organization.members.reactivate",
  );
}

export function revokeMembership(
  opaqueToken: string,
  targetMembershipId: string,
  reason: string,
): Promise<OrganizationMembershipDto> {
  return changeMembershipStatus(
    opaqueToken,
    targetMembershipId,
    OrganizationMembershipStatus.REVOKED,
    "organization.members.remove",
    reason,
  );
}

export async function grantStoreAccess(
  opaqueToken: string,
  targetMembershipId: string,
  requestedStoreId: string,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await authorizationForMutation(
      tx,
      opaqueToken,
      "stores.access.grant",
    );
    const target = await findTarget(
      tx,
      actor.organization.id,
      targetMembershipId,
    );
    if (target.status !== OrganizationMembershipStatus.ACTIVE) deny();
    const store = await tx.store.findFirst({
      where: {
        id: parseUuid(requestedStoreId),
        organizationId: actor.organization.id,
        status: StoreStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!store) deny();
    return tx.storeAccess.upsert({
      where: {
        organizationMembershipId_storeId: {
          organizationMembershipId: target.id,
          storeId: store.id,
        },
      },
      create: {
        organizationId: actor.organization.id,
        organizationMembershipId: target.id,
        storeId: store.id,
      },
      update: {
        status: StoreAccessStatus.ACTIVE,
        revokedAt: null,
      },
      select: {
        id: true,
        status: true,
        store: { select: { id: true, code: true, name: true } },
      },
    });
  });
}

export async function revokeStoreAccess(
  opaqueToken: string,
  targetMembershipId: string,
  requestedStoreId: string,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await authorizationForMutation(
      tx,
      opaqueToken,
      "stores.access.revoke",
    );
    const target = await findTarget(
      tx,
      actor.organization.id,
      targetMembershipId,
    );
    const storeId = parseUuid(requestedStoreId);
    const access = await tx.storeAccess.findFirst({
      where: {
        organizationId: actor.organization.id,
        organizationMembershipId: target.id,
        storeId,
      },
      select: { id: true },
    });
    if (!access) deny();
    const updated = await tx.storeAccess.update({
      where: { id: access.id },
      data: {
        status: StoreAccessStatus.REVOKED,
        revokedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        store: { select: { id: true, code: true, name: true } },
      },
    });
    await tx.session.updateMany({
      where: {
        activeOrganizationId: actor.organization.id,
        activeOrganizationMembershipId: target.id,
        activeStoreId: storeId,
      },
      data: {
        activeStoreId: null,
        contextUpdatedAt: new Date(),
        contextVersion: { increment: 1 },
      },
    });
    return updated;
  });
}

export async function transferOwnership(
  opaqueToken: string,
  targetMembershipId: string,
  options: { demoteActorTo?: Exclude<OrganizationRole, "OWNER"> } = {},
): Promise<{
  actor: OrganizationMembershipDto;
  target: OrganizationMembershipDto;
}> {
  const parsedDemotion = options.demoteActorTo
    ? roleSchema.safeParse(options.demoteActorTo)
    : null;
  if (parsedDemotion && !parsedDemotion.success) deny();
  const demoteActorTo = parsedDemotion?.data;
  if (demoteActorTo === OrganizationRole.OWNER) deny();

  return serializableTransaction(
    async (tx) => {
      const actor = await getAuthorizationContextInTransaction(tx, opaqueToken);
      if (actor.role !== OrganizationRole.OWNER) deny();
      const target = await findTarget(
        tx,
        actor.organization.id,
        targetMembershipId,
      );
      if (
        target.id === actor.membership.id ||
        target.status !== OrganizationMembershipStatus.ACTIVE
      ) {
        deny();
      }

      await acquireOrganizationOwnerLock(tx, actor.organization.id);
      await lockOwners(tx, actor.organization.id);
      await assertActorIsActiveOwner(
        tx,
        actor.organization.id,
        actor.membership.id,
      );

      const promoted = await tx.organizationMembership.update({
        where: { id: target.id },
        data: { role: OrganizationRole.OWNER },
        select: membershipSelect,
      });
      if (demoteActorTo) {
        await tx.organizationMembership.update({
          where: { id: actor.membership.id },
          data: { role: demoteActorTo },
        });
      }
      await assertActiveOwnerRemains(tx, actor.organization.id);
      const updatedActor = await tx.organizationMembership.findUniqueOrThrow({
        where: { id: actor.membership.id },
        select: membershipSelect,
      });
      return { actor: updatedActor, target: promoted };
    },
  );
}
