import {
  OrganizationMembershipStatus,
  OrganizationRole,
  StoreAccessStatus,
} from "../../generated/prisma/client";
import { prisma } from "../db/prisma";
import { normalizeEmail } from "../auth/email";
import { hashPassword, validatePasswordInput } from "../auth/password";

export type PilotBootstrapConfig = {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  organizationName: string;
  organizationSlug: string;
  storeName: string;
  storeCode: string;
  resetPassword?: boolean;
};

export type PilotBootstrapResult = {
  userId: string;
  organizationId: string;
  storeId: string;
  membershipId: string;
  storeAccessId: string;
  email: string;
  organizationSlug: string;
};

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export function readPilotBootstrapConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PilotBootstrapConfig {
  return {
    adminName: required(environment.BOOTSTRAP_ADMIN_NAME ?? "", "BOOTSTRAP_ADMIN_NAME"),
    adminEmail: required(environment.BOOTSTRAP_ADMIN_EMAIL ?? "", "BOOTSTRAP_ADMIN_EMAIL"),
    adminPassword: required(environment.BOOTSTRAP_ADMIN_PASSWORD ?? "", "BOOTSTRAP_ADMIN_PASSWORD"),
    organizationName: required(environment.BOOTSTRAP_ORGANIZATION_NAME ?? "", "BOOTSTRAP_ORGANIZATION_NAME"),
    organizationSlug: required(environment.BOOTSTRAP_ORGANIZATION_SLUG ?? "", "BOOTSTRAP_ORGANIZATION_SLUG").toLocaleLowerCase("en-US"),
    storeName: required(environment.BOOTSTRAP_STORE_NAME ?? "", "BOOTSTRAP_STORE_NAME"),
    storeCode: required(environment.BOOTSTRAP_STORE_CODE ?? "", "BOOTSTRAP_STORE_CODE").toLocaleUpperCase("en-US"),
    resetPassword: environment.BOOTSTRAP_RESET_PASSWORD === "true",
  };
}

export async function bootstrapPilot(
  input: PilotBootstrapConfig,
): Promise<PilotBootstrapResult> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Pilot bootstrap is disabled in production.");
  }

  const config = {
    adminName: required(input.adminName, "BOOTSTRAP_ADMIN_NAME"),
    adminEmail: normalizeEmail(input.adminEmail),
    adminPassword: validatePasswordInput(input.adminPassword),
    organizationName: required(input.organizationName, "BOOTSTRAP_ORGANIZATION_NAME"),
    organizationSlug: required(input.organizationSlug, "BOOTSTRAP_ORGANIZATION_SLUG").toLocaleLowerCase("en-US"),
    storeName: required(input.storeName, "BOOTSTRAP_STORE_NAME"),
    storeCode: required(input.storeCode, "BOOTSTRAP_STORE_CODE").toLocaleUpperCase("en-US"),
    resetPassword: input.resetPassword === true,
  };
  const preparedPasswordHash = await hashPassword(config.adminPassword);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { normalizedEmail: config.adminEmail },
      create: {
        email: config.adminEmail,
        normalizedEmail: config.adminEmail,
        name: config.adminName,
      },
      update: {},
      select: { id: true, email: true },
    });

    const credential = await tx.userCredential.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!credential || config.resetPassword) {
      await tx.userCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordHash: preparedPasswordHash },
        update: config.resetPassword
          ? {
              passwordHash: preparedPasswordHash,
              passwordUpdatedAt: new Date(),
            }
          : {},
      });
    }

    const organization = await tx.organization.upsert({
      where: { slug: config.organizationSlug },
      create: {
        legalName: config.organizationName,
        tradeName: config.organizationName,
        slug: config.organizationSlug,
      },
      update: {},
      select: { id: true, slug: true },
    });

    const store = await tx.store.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: config.storeCode,
        },
      },
      create: {
        organizationId: organization.id,
        name: config.storeName,
        code: config.storeCode,
        isHeadquarters: true,
      },
      update: {},
      select: { id: true },
    });

    const membership = await tx.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: OrganizationRole.OWNER,
      },
      update: {
        status: OrganizationMembershipStatus.ACTIVE,
        disabledAt: null,
        disabledReason: null,
      },
      select: { id: true, role: true },
    });
    if (membership.role !== OrganizationRole.OWNER) {
      await tx.organizationMembership.update({
        where: { id: membership.id },
        data: { role: OrganizationRole.OWNER },
      });
    }

    const storeAccess = await tx.storeAccess.upsert({
      where: {
        organizationMembershipId_storeId: {
          organizationMembershipId: membership.id,
          storeId: store.id,
        },
      },
      create: {
        organizationId: organization.id,
        organizationMembershipId: membership.id,
        storeId: store.id,
      },
      update: {
        status: StoreAccessStatus.ACTIVE,
        revokedAt: null,
      },
      select: { id: true },
    });

    return {
      userId: user.id,
      organizationId: organization.id,
      storeId: store.id,
      membershipId: membership.id,
      storeAccessId: storeAccess.id,
      email: user.email,
      organizationSlug: organization.slug,
    };
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  });
}
