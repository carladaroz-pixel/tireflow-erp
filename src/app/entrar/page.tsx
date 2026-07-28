"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { demoTenant, platformConfig } from "@/lib/tireflow-config";

export default function TireFlowLogin() {
  const router = useRouter();
  const [role, setRole] = useState("Administrador");
  return (
    <div className="tireflow-login-wrap">
      <div className="tireflow-login">
        <section className="tireflow-login-art">
          <div>
            <div className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></div>
            <h1>Controle total.<br/>Do estoque ao caixa.</h1>
            <p>{platformConfig.description}. Uma operação mais segura, rastreável e lucrativa.</p>
          </div>
          <small>Ambiente demonstrativo • Dados fictícios</small>
        </section>
        <form className="tireflow-login-form" onSubmit={(event) => { event.preventDefault(); localStorage.setItem("tireflow-demo-role", role); router.push("/"); }}>
          <p className="tireflow-eyebrow">BEM-VINDO DE VOLTA</p>
          <h2>Acesse sua conta</h2>
          <p>{demoTenant.tradingName} • Selecione um perfil para explorar a demonstração.</p>
          <div className="tireflow-field"><label>E-MAIL</label><input type="email" defaultValue="admin@tireflow.demo" required /></div>
          <div className="tireflow-field"><label>SENHA</label><input type="password" defaultValue="demo123" required /></div>
          <div className="tireflow-field"><label>PERFIL DEMONSTRATIVO</label><select value={role} onChange={(event) => setRole(event.target.value)}><option>Administrador</option><option>Gerente</option><option>Atendente</option><option>Estoquista</option><option>Mecânico</option></select></div>
          <button className="tireflow-btn primary" type="submit">Entrar no sistema</button>
          <div className="tireflow-demo-access"><strong>Acesso de demonstração</strong><br/>Use os dados preenchidos. Esta tela não representa autenticação de produção.</div>
        </form>
      </div>
    </div>
  );
}
