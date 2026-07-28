"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TireFlowIcon } from "./tireflow-icons";
import { demoTenant, platformConfig } from "@/lib/tireflow-config";

const mainItems = [
  ["dashboard", "Dashboard", "/"],
  ["box", "Produtos e Pneus", "/produtos"],
  ["stock", "Estoque", "/estoque"],
  ["move", "Movimentações", "/movimentacoes"],
  ["shield", "Controle e Auditoria", "/auditoria"],
];
const futureItems = [
  "Clientes e veículos",
  "Vendas e ordens de serviço",
  "Agenda e revisões",
  "Garantias",
  "Ferramentas",
  "Financeiro e comissões",
  "Relatórios",
  "Inteligência antifraude",
];

export function TireFlowShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path === "/entrar") return <>{children}</>;
  const nav = (
    <>
      <p className="tireflow-nav-label">OPERAÇÃO</p>
      <nav className="space-y-1">
        {mainItems.map(([icon, label, href]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} className={`tireflow-nav-item ${path === href ? "is-active" : ""}`}>
            <TireFlowIcon name={icon} /><span>{label}</span>{label === "Controle e Auditoria" && <b>3</b>}
          </Link>
        ))}
      </nav>
      <p className="tireflow-nav-label mt-7">PRÓXIMAS FASES</p>
      <div className="space-y-1">
        {futureItems.map((label) => <div className="tireflow-nav-item is-disabled" key={label}><TireFlowIcon name="plus"/><span>{label}</span></div>)}
      </div>
    </>
  );

  return (
    <div className="tireflow-app" style={{"--tenant-primary":demoTenant.primaryColor,"--tenant-accent":demoTenant.accentColor,"--tenant-danger":demoTenant.dangerColor} as React.CSSProperties}>
      <aside className="tireflow-sidebar">
        <Link href="/" className="tireflow-brand">
          <span className="tireflow-brand-mark"><span /></span>
          <span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span>
        </Link>
        <div className="tireflow-company"><small>EMPRESA ATIVA</small><strong>{demoTenant.tradingName}</strong><span>{demoTenant.address}</span></div>
        {nav}
        <div className="tireflow-user">
          <span>BN</span><div><strong>Beatriz Nunes</strong><small>Administrador</small></div><Link href="/entrar" aria-label="Sair">↗</Link>
        </div>
      </aside>
      <header className="tireflow-mobile-header">
        <Link href="/" className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></Link>
        <button onClick={() => setOpen(!open)} aria-label="Abrir menu"><TireFlowIcon name="menu" /></button>
      </header>
      {open && <div className="tireflow-mobile-nav">{nav}</div>}
      <main className="tireflow-main">
        <div className="tireflow-topbar">
          <div className="tireflow-search"><TireFlowIcon name="search"/><input aria-label="Busca global" placeholder="Buscar pneu, cliente, placa ou OS..."/><kbd>⌘ K</kbd></div>
          <div className="tireflow-top-actions"><button aria-label="Notificações"><TireFlowIcon name="bell"/><b>5</b></button><span className="tireflow-role">{demoTenant.tradingName} • Demonstração</span></div>
        </div>
        <div className="tireflow-content">{children}</div>
      </main>
    </div>
  );
}
