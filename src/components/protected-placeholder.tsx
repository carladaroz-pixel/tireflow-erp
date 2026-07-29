import { notFound } from "next/navigation";

import { WorkspaceFrame } from "@/components/workspace-frame";
import { hasPermission, type PermissionKey } from "@/lib/auth/permissions";
import { getRequiredWorkspaceContext } from "@/lib/auth/web-session";

export async function ProtectedPlaceholder({
  eyebrow,
  title,
  description,
  permission,
}: {
  eyebrow: string;
  title: string;
  description: string;
  permission: PermissionKey;
}) {
  const context = await getRequiredWorkspaceContext();
  if (!hasPermission(context.role, permission)) notFound();
  return (
    <WorkspaceFrame>
      <header className="tireflow-page-head"><div><p className="tireflow-eyebrow">{eyebrow}</p><h1 className="tireflow-title">{title}</h1><p className="tireflow-subtitle">{description}</p></div><span className="tireflow-coming-badge">Em breve</span></header>
      <section className="tireflow-card tireflow-placeholder"><div className="tireflow-foundation-icon">+</div><h2>Módulo preparado para a próxima etapa</h2><p>A rota já respeita sessão, tenant, loja e permissões no servidor. Nenhum dado operacional fictício foi criado.</p></section>
    </WorkspaceFrame>
  );
}
