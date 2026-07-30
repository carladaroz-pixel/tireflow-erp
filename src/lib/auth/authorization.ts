import { z } from "zod";

import {
  OrganizationMembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  Prisma,
  StoreAccessStatus,
  StoreStatus,
  UserStatus,
} from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import {
  hasPermission,
  type PermissionKey,
  PERMISSION_SCOPE,
} from "./permissions";
import { hashSessionToken } from "./session-token";

const tokenSchema = z.string().min(43).max(128);
const AUTHORIZATION_DENIED_MESSAGE = "Authorization is unavailable.";

export class AuthorizationDeniedError extends Error {
  constructor() {
    super(AUTHORIZATION_DENIED_MESSAGE);
    this.name = "AuthorizationDeniedError";
  }
}

export type AuthorizationContext = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  session: {
    id: string;
    contextUpdatedAt: Date | null;
  };
  organization: {
    id: string;
    slug: string;
    tradeName: string;
  };
  membership: {
    id: string;
    role: OrganizationRole;
    status: OrganizationMembershipStatus;
  };
  role: OrganizationRole;
  store: {
    id: string;
    code: string;
    name: string;
  } | null;
  storeAccess: {
    id: string;
    status: StoreAccessStatus;
  } | null;
};

export type AuthorizationTransaction = Prisma.TransactionClient;
type AuthorizationReader = Pick<Prisma.TransactionClient, "session">;

export async function getAuthorizationContextInTransaction(
  tx: AuthorizationReader,
  opaqueToken: string,
  now = new Date(),
): Promise<AuthorizationContext> {
  const parsedToken = tokenSchema.safeParse(opaqueToken);
  if (!parsedToken.success) {
    throw new AuthorizationDeniedError();
  }
  const tokenHash = hashSessionToken(parsedToken.data);
  const session = await tx.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      idleExpiresAt: true,
      revokedAt: true,
      contextUpdatedAt: true,
      activeOrganizationId: true,
      activeOrganizationMembershipId: true,
      activeStoreId: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
        },
      },
      activeMembership: {
        select: {
          id: true,
          status: true,
          role: true,
          organization: {
            select: {
              id: true,
              slug: true,
              tradeName: true,
              status: true,
            },
          },
        },
      },
      activeStore: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      },
      activeStoreAccess: {
        select: {
          id: true,
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
    session.user.status !== UserStatus.ACTIVE ||
    !session.activeOrganizationId ||
    !session.activeOrganizationMembershipId ||
    !session.activeMembership ||
    session.activeMembership.status !== OrganizationMembershipStatus.ACTIVE ||
    session.activeMembership.organization.status !== OrganizationStatus.ACTIVE ||
    session.activeMembership.organization.id !== session.activeOrganizationId
  ) {
    throw new AuthorizationDeniedError();
  }

  const hasStoreContext = session.activeStoreId !== null;
  if (
    hasStoreContext &&
    (!session.activeStore ||
      session.activeStore.status !== StoreStatus.ACTIVE ||
      !session.activeStoreAccess ||
      session.activeStoreAccess.status !== StoreAccessStatus.ACTIVE)
  ) {
    throw new AuthorizationDeniedError();
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    session: {
      id: session.id,
      contextUpdatedAt: session.contextUpdatedAt,
    },
    organization: {
      id: session.activeMembership.organization.id,
      slug: session.activeMembership.organization.slug,
      tradeName: session.activeMembership.organization.tradeName,
    },
    membership: {
      id: session.activeMembership.id,
      role: session.activeMembership.role,
      status: session.activeMembership.status,
    },
    role: session.activeMembership.role,
    store: hasStoreContext ? session.activeStore : null,
    storeAccess: hasStoreContext ? session.activeStoreAccess : null,
  };
}

export async function getAuthorizationContext(
  opaqueToken: string,
  now = new Date(),
): Promise<AuthorizationContext> {
  return getAuthorizationContextInTransaction(prisma, opaqueToken, now);
}

export function requirePermission(
  context: AuthorizationContext,
  permission: string,
): asserts permission is PermissionKey {
  if (!hasPermission(context.role, permission)) {
    throw new AuthorizationDeniedError();
  }
}

export async function requireOrganizationPermission(
  opaqueToken: string,
  permission: PermissionKey,
  now = new Date(),
): Promise<AuthorizationContext> {
  if (PERMISSION_SCOPE[permission] !== "ORGANIZATION") {
    throw new AuthorizationDeniedError();
  }
  const context = await getAuthorizationContext(opaqueToken, now);
  requirePermission(context, permission);
  return context;
}

export async function requireStorePermission(
  opaqueToken: string,
  permission: PermissionKey,
  now = new Date(),
): Promise<AuthorizationContext & {
  store: NonNullable<AuthorizationContext["store"]>;
  storeAccess: NonNullable<AuthorizationContext["storeAccess"]>;
}> {
  if (PERMISSION_SCOPE[permission] === "ORGANIZATION") {
    throw new AuthorizationDeniedError();
  }
  const context = await getAuthorizationContext(opaqueToken, now);
  requirePermission(context, permission);
  if (!context.store || !context.storeAccess) {
    throw new AuthorizationDeniedError();
  }
  return context as AuthorizationContext & {
    store: NonNullable<AuthorizationContext["store"]>;
    storeAccess: NonNullable<AuthorizationContext["storeAccess"]>;
  };
}
