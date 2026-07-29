import { OrganizationRole } from "../../generated/prisma/client";

export const PERMISSION_KEYS = [
  "records.read",
  "records.create",
  "records.update",
  "records.deactivate",
  "records.hard_delete",
  "inventory.read",
  "inventory.entry.create",
  "inventory.exit.create",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.history.read",
  "inventory.reverse",
  "costs.read",
  "costs.update",
  "margins.read",
  "financial.totals.read",
  "financial.export",
  "operations.cancel",
  "operations.reverse",
  "operations.adjust.approve",
  "operations.reopen",
  "sensitive_history.read",
  "reports.read",
  "reports.export",
  "reports.organization.read",
  "organization.members.invite",
  "organization.members.read",
  "organization.members.role.update",
  "organization.members.suspend",
  "organization.members.reactivate",
  "organization.members.remove",
  "stores.access.grant",
  "stores.access.revoke",
  "organization.ownership.transfer",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionScope = "ORGANIZATION" | "STORE" | "TWO_STORES";

const organizationPermissions = [
  "financial.totals.read",
  "financial.export",
  "sensitive_history.read",
  "reports.organization.read",
  "organization.members.invite",
  "organization.members.read",
  "organization.members.role.update",
  "organization.members.suspend",
  "organization.members.reactivate",
  "organization.members.remove",
  "stores.access.grant",
  "stores.access.revoke",
  "organization.ownership.transfer",
] as const satisfies readonly PermissionKey[];

export const PERMISSION_SCOPE: Readonly<Record<PermissionKey, PermissionScope>> =
  Object.freeze(
    Object.fromEntries(
      PERMISSION_KEYS.map((permission) => [
        permission,
        permission === "inventory.transfer"
          ? "TWO_STORES"
          : organizationPermissions.includes(
                permission as (typeof organizationPermissions)[number],
              )
            ? "ORGANIZATION"
            : "STORE",
      ]),
    ) as Record<PermissionKey, PermissionScope>,
  );

const ownerPermissions = PERMISSION_KEYS.filter(
  (permission) => permission !== "records.hard_delete",
);
const adminPermissions = ownerPermissions.filter(
  (permission) => permission !== "organization.ownership.transfer",
);
const managerPermissions = [
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
] as const satisfies readonly PermissionKey[];
const operatorPermissions = [
  "records.read",
  "records.create",
  "records.update",
  "inventory.read",
  "inventory.entry.create",
  "inventory.exit.create",
  "inventory.history.read",
  "reports.read",
] as const satisfies readonly PermissionKey[];
const viewerPermissions = [
  "records.read",
  "inventory.read",
  "inventory.history.read",
  "reports.read",
] as const satisfies readonly PermissionKey[];

function readonlyPermissionSet(
  permissions: readonly PermissionKey[],
): ReadonlySet<PermissionKey> {
  return new Set(permissions);
}

export const ROLE_PERMISSIONS: Readonly<
  Record<OrganizationRole, ReadonlySet<PermissionKey>>
> = Object.freeze({
  [OrganizationRole.OWNER]: readonlyPermissionSet(ownerPermissions),
  [OrganizationRole.ADMIN]: readonlyPermissionSet(adminPermissions),
  [OrganizationRole.MANAGER]: readonlyPermissionSet(managerPermissions),
  [OrganizationRole.OPERATOR]: readonlyPermissionSet(operatorPermissions),
  [OrganizationRole.VIEWER]: readonlyPermissionSet(viewerPermissions),
});

const permissionKeySet = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeySet.has(value);
}

export function hasPermission(
  role: OrganizationRole,
  permission: string,
): permission is PermissionKey {
  return isPermissionKey(permission) && ROLE_PERMISSIONS[role].has(permission);
}
