"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import { platformConfig } from "@/lib/tireflow-config";
import { GlobalQuickSearch } from "./global-quick-search";
import { TireFlowIcon } from "./tireflow-icons";

export type WorkspaceIdentity = {
  userName: string;
  role: string;
  organizationName: string;
  storeName: string;
  allowed: { inventory: boolean; reports: boolean; users: boolean; settings: boolean };
};

const roleLabel: Record<string, string> = {
  OWNER: "Proprietário", ADMIN: "Administrador", MANAGER: "Gerente", OPERATOR: "Operador", VIEWER: "Leitor",
};

export function TireFlowShell({ children, identity }: { children: React.ReactNode; identity: WorkspaceIdentity }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const initials = identity.userName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const items = [
    { icon: "dashboard", label: "Dashboard", href: "/", show: true },
    { icon: "box", label: "Produtos e Pneus", href: "/produtos", show: identity.allowed.inventory },
    { icon: "stock", label: "Estoque", href: "/estoque", show: identity.allowed.inventory },
    { icon: "move", label: "Entradas e Saídas", href: "/movimentacoes", show: identity.allowed.inventory },
    { icon: "users", label: "Clientes", href: "/clientes", show: true },
    { icon: "plus", label: "Ordens de Serviço", href: "/servicos", show: true },
    { icon: "move", label: "Notas Fiscais", href: "/notas-fiscais", show: identity.allowed.inventory },
    { icon: "trend", label: "Relatórios", href: "/relatorios", show: identity.allowed.reports },
    { icon: "shield", label: "Usuários e Acessos", href: "/usuarios", show: identity.allowed.users },
    { icon: "plus", label: "Configurações", href: "/configuracoes", show: identity.allowed.settings },
  ].filter((item) => item.show);
  const nav = (
    <nav aria-label="Navegação principal">
      <p className="tireflow-nav-label">OPERAÇÃO</p>
      {items.map((item) => (
        <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`tireflow-nav-item ${path === item.href ? "is-active" : ""}`}>
          <TireFlowIcon name={item.icon} /><span>{item.label}</span>{["/usuarios","/configuracoes"].includes(item.href) ? <em>Em breve</em> : null}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="tireflow-app">
      <aside className="tireflow-sidebar">
        <Link href="/" className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></Link>
        <div className="tireflow-company"><small>CONTEXTO ATIVO</small><strong>{identity.organizationName}</strong><span>{identity.storeName}</span><Link href="/contexto">Trocar organização ou loja</Link></div>
        {nav}
        <div className="tireflow-user">
          <span>{initials}</span><div><strong>{identity.userName}</strong><small>{roleLabel[identity.role] ?? identity.role}</small></div>
          <form action={logoutAction}><button type="submit" aria-label="Sair">↗</button></form>
        </div>
      </aside>
      <header className="tireflow-mobile-header">
        <Link href="/" className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></Link>
        <button onClick={() => setOpen((value) => !value)} aria-label="Abrir menu"><TireFlowIcon name="menu" /></button>
      </header>
      {open ? <div className="tireflow-mobile-nav">{nav}</div> : null}
      <main className="tireflow-main">
        <div className="tireflow-topbar">
          <GlobalQuickSearch />
          <div><strong>{identity.organizationName}</strong><span className="tireflow-top-context"> • {identity.storeName}</span></div>
          <div className="tireflow-top-actions"><Link className="tireflow-context-link" href="/contexto">Trocar contexto</Link><span className="tireflow-role">{roleLabel[identity.role] ?? identity.role}</span></div>
        </div>
        <div className="tireflow-content">{children}</div>
      </main>
    </div>
  );
}
