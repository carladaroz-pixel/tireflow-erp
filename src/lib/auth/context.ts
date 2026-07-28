import { z } from "zod";

import {
  OrganizationMembershipStatus,
  OrganizationStatus,
  Prisma,
  StoreAccessStatus,
  StoreStatus,
  UserStatus,
} from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import { hashSessionToken } from "./session-token";

const uuidSchema = z.string().uuid();
const tokenSchema = z.string().min(43).max(128);

const CONTEXT_UNAVAILABLE_MESSAGE = "Context is unavailable.";
const CONTEXT_CONFLICT_MESSAGE = "Context changed. Retry the operation.";

export class ContextUnavailableError extends Error {
  constructor() {
    super(CONTEXT_UNAVAILABLE_MESSAGE);
    this.name = "ContextUnavailableError";
  }
}

export class ContextConflictError extends Error {
  constructor() {
    super(CONTEXT_CONFLICT_MESSAGE);
    this.name = "ContextConflictError";
  }
}

type ContextTransaction = Prisma.TransactionClient;

type InternalSession = {
  activeOrganizationId: string | null;
  activeOrganizationMembershipId: string | null;
  activeStoreId: string | null;
  contextUpdatedAt: Date | null;
  contextVersion: number;
  expiresAt: Date;
  id: string;
  idleExpiresAt: Date;
  revokedAt: Date | null;
  user: {
    status: UserStatus;
  };
  userId: string;
};

export type OrganizationContextDto = {
  contextUpdatedAt: Date | null;
  membership: {
    id: string;
    status: OrganizationMembershipStatus;
  };
  organization: {
    id: string;
    slug: string;
    tradeName: string;
  };
  store: {
    code: string;
    id: string;
    name: string;
  } | null;
};

export type AvailableOrganizationDto = {
  membership: {
    id: string;
    status: OrganizationMembershipStatus;
  };
  organization: {
    id: string;
    slug: string;
    tradeName: string;
  };
};

export type AvailableStoreDto = {
  code: string;
  id: string;
  name: string;
};

async function loadAuthenticatedSession(
  tx: ContextTransaction,
  token: string,
  now = new Date(),
): Promise<InternalSession> {
  const tokenHash = hashSessionToken(tokenSchema.parse(token));
  const session = await tx.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      idleExpiresAt: true,
      revokedAt: true,
      activeOrganizationId: true,
      activeOrganizationMembershipId: true,
      activeStoreId: true,
      contextUpdatedAt: true,
      contextVersion: true,
      user: {
        select: {
          status: true,
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.idleExpiresAt <= now ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    throw new ContextUnavailableError();
  }

  return session;
}

async function updateContextVersioned(
  tx: ContextTransaction,
  session: InternalSession,
  data: Prisma.SessionUncheckedUpdateManyInput,
): Promise<void> {
  const result = await tx.session.updateMany({
    where: {
      id: session.id,
      contextVersion: session.contextVersion,
      revokedAt: null,
    },
    data: {
      ...data,
      contextVersion: {
        increment: 1,
      },
    },
  });

  if (result.count !== 1) {
    throw new ContextConflictError();
  }
}

function organizationDto(
  membership: {
    id: string;
    status: OrganizationMembershipStatus;
    organization: {
      id: string;
      slug: string;
      tradeName: string;
    };
  },
  contextUpdatedAt: Date | null,
  store: OrganizationContextDto["store"] = null,
): OrganizationContextDto {
  return {
    organization: membership.organization,
    membership: {
      id: membership.id,
      status: membership.status,
    },
    store,
    contextUpdatedAt,
  };
}

async function resolveValidMembership(
  tx: ContextTransaction,
  session: InternalSession,
) {
  if (
    !session.activeOrganizationId ||
    !session.activeOrganizationMembershipId
  ) {
    return null;
  }

  return tx.organizationMembership.findFirst({
    where: {
      id: session.activeOrganizationMembershipId,
      organizationId: session.activeOrganizationId,
      userId: session.userId,
      status: OrganizationMembershipStatus.ACTIVE,
      organization: {
        status: OrganizationStatus.ACTIVE,
      },
    },
    select: {
      id: true,
      status: true,
      organization: {
        select: {
          id: true,
          tradeName: true,
          slug: true,
        },
      },
    },
  });
}

async function clearAllContext(
  tx: ContextTransaction,
  session: InternalSession,
  now: Date,
): Promise<void> {
  await updateContextVersioned(tx, session, {
    activeOrganizationId: null,
    activeOrganizationMembershipId: null,
    activeStoreId: null,
    contextUpdatedAt: now,
  });
}

async function clearStoreContext(
  tx: ContextTransaction,
  session: InternalSession,
  now: Date,
): Promise<void> {
  await updateContextVersioned(tx, session, {
    activeStoreId: null,
    contextUpdatedAt: now,
  });
}

export async function getSessionContext(
  token: string,
  now = new Date(),
): Promise<OrganizationContextDto | null> {
  return prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);

    if (
      !session.activeOrganizationId &&
      !session.activeOrganizationMembershipId &&
      !session.activeStoreId
    ) {
      return null;
    }

    const membership = await resolveValidMembership(tx, session);
    if (!membership) {
      await clearAllContext(tx, session, now);
      return null;
    }

    if (!session.activeStoreId) {
      return organizationDto(
        membership,
        session.contextUpdatedAt,
      );
    }

    const access = await tx.storeAccess.findFirst({
      where: {
        organizationId: session.activeOrganizationId!,
        organizationMembershipId: membership.id,
        storeId: session.activeStoreId,
        status: StoreAccessStatus.ACTIVE,
        store: {
          status: StoreStatus.ACTIVE,
        },
      },
      select: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!access) {
      await clearStoreContext(tx, session, now);
      return organizationDto(membership, now);
    }

    return organizationDto(
      membership,
      session.contextUpdatedAt,
      access.store,
    );
  });
}

export async function listAvailableOrganizations(
  token: string,
  now = new Date(),
): Promise<AvailableOrganizationDto[]> {
  return prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);
    const memberships = await tx.organizationMembership.findMany({
      where: {
        userId: session.userId,
        status: OrganizationMembershipStatus.ACTIVE,
        organization: {
          status: OrganizationStatus.ACTIVE,
        },
      },
      orderBy: {
        organization: {
          tradeName: "asc",
        },
      },
      select: {
        id: true,
        status: true,
        organization: {
          select: {
            id: true,
            tradeName: true,
            slug: true,
          },
        },
      },
    });

    return memberships.map((membership) => ({
      organization: membership.organization,
      membership: {
        id: membership.id,
        status: membership.status,
      },
    }));
  });
}

export async function listAvailableStores(
  token: string,
  now = new Date(),
): Promise<AvailableStoreDto[]> {
  return prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);
    const membership = await resolveValidMembership(tx, session);

    if (!membership || !session.activeOrganizationId) {
      throw new ContextUnavailableError();
    }

    const accesses = await tx.storeAccess.findMany({
      where: {
        organizationId: session.activeOrganizationId,
        organizationMembershipId: membership.id,
        status: StoreAccessStatus.ACTIVE,
        store: {
          status: StoreStatus.ACTIVE,
        },
      },
      orderBy: {
        store: {
          name: "asc",
        },
      },
      select: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    return accesses.map(({ store }) => store);
  });
}

export async function selectOrganizationContext(
  token: string,
  requestedOrganizationId: string,
  now = new Date(),
): Promise<OrganizationContextDto> {
  const organizationId = uuidSchema.parse(requestedOrganizationId);

  return prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);
    const membership = await tx.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: session.userId,
        status: OrganizationMembershipStatus.ACTIVE,
        organization: {
          status: OrganizationStatus.ACTIVE,
        },
      },
      select: {
        id: true,
        status: true,
        organization: {
          select: {
            id: true,
            tradeName: true,
            slug: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ContextUnavailableError();
    }

    await updateContextVersioned(tx, session, {
      activeOrganizationId: membership.organization.id,
      activeOrganizationMembershipId: membership.id,
      activeStoreId: null,
      contextUpdatedAt: now,
    });

    return organizationDto(membership, now);
  });
}

export async function selectStoreContext(
  token: string,
  requestedStoreId: string,
  now = new Date(),
): Promise<OrganizationContextDto> {
  const storeId = uuidSchema.parse(requestedStoreId);

  return prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);
    const membership = await resolveValidMembership(tx, session);

    if (!membership || !session.activeOrganizationId) {
      throw new ContextUnavailableError();
    }

    const access = await tx.storeAccess.findFirst({
      where: {
        organizationId: session.activeOrganizationId,
        organizationMembershipId: membership.id,
        storeId,
        status: StoreAccessStatus.ACTIVE,
        store: {
          status: StoreStatus.ACTIVE,
        },
      },
      select: {
        store: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!access) {
      throw new ContextUnavailableError();
    }

    await updateContextVersioned(tx, session, {
      activeStoreId: access.store.id,
      contextUpdatedAt: now,
    });

    return organizationDto(membership, now, access.store);
  });
}

export async function clearSessionContext(
  token: string,
  now = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const session = await loadAuthenticatedSession(tx, token, now);
    await clearAllContext(tx, session, now);
  });
}

export async function requireOrganizationContext(
  token: string,
  now = new Date(),
): Promise<OrganizationContextDto> {
  const context = await getSessionContext(token, now);
  if (!context) {
    throw new ContextUnavailableError();
  }
  return context;
}

export async function requireStoreContext(
  token: string,
  now = new Date(),
): Promise<OrganizationContextDto & { store: NonNullable<OrganizationContextDto["store"]> }> {
  const context = await requireOrganizationContext(token, now);
  if (!context.store) {
    throw new ContextUnavailableError();
  }
  return context as OrganizationContextDto & {
    store: NonNullable<OrganizationContextDto["store"]>;
  };
}
