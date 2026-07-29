import { TireFlowShell } from "@/components/tireflow-shell";
import { hasPermission } from "@/lib/auth/permissions";
import { getRequiredWorkspaceContext } from "@/lib/auth/web-session";

export async function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const context = await getRequiredWorkspaceContext();
  return (
    <TireFlowShell identity={{
      userName: context.user.name,
      role: context.role,
      organizationName: context.organization.tradeName,
      storeName: context.store.name,
      allowed: {
        inventory: hasPermission(context.role, "inventory.read"),
        reports: hasPermission(context.role, "reports.read"),
        users: hasPermission(context.role, "organization.members.read"),
        settings: context.role === "OWNER" || context.role === "ADMIN",
      },
    }}>{children}</TireFlowShell>
  );
}
