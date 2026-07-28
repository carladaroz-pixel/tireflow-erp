import Link from "next/link";
import { TireFlowIcon } from "@/components/tireflow-icons";
import { currency, demoMovements } from "@/lib/tireflow-demo-data";

const bars = [48, 61, 43, 72, 66, 86, 75, 94, 69, 82, 92, 78];
export default function TireFlowDashboard() {
  return (
    <>
      <header className="tireflow-page-head"><div><p className="tireflow-eyebrow">VISÃO GERAL • 28 JUL 2026</p><h1 className="tireflow-title">Bom dia, Beatriz.</h1><p className="tireflow-subtitle">Acompanhe os principais indicadores da operação.</p></div><div className="tireflow-actions"><button className="tireflow-btn"><TireFlowIcon name="download"/> Exportar resumo</button><Link className="tireflow-btn primary" href="/movimentacoes"><TireFlowIcon name="plus"/> Nova movimentação</Link></div></header>
      <section className="tireflow-grid tireflow-kpis">
        <article className="tireflow-card tireflow-kpi"><div className="tireflow-kpi-top"><span className="tireflow-kpi-icon green"><TireFlowIcon name="trend"/></span><span className="tireflow-kpi-change">↑ 12,4%</span></div><strong>{currency(7842.5)}</strong><p>Faturamento hoje</p></article>
        <article className="tireflow-card tireflow-kpi"><div className="tireflow-kpi-top"><span className="tireflow-kpi-icon blue"><TireFlowIcon name="stock"/></span><span className="tireflow-kpi-change">18 vendas</span></div><strong>{currency(128540)}</strong><p>Estoque total • 286 itens</p></article>
        <article className="tireflow-card tireflow-kpi"><div className="tireflow-kpi-top"><span className="tireflow-kpi-icon"><TireFlowIcon name="move"/></span><span className="tireflow-kpi-change">7 em execução</span></div><strong>14</strong><p>Ordens de serviço ativas</p></article>
        <article className="tireflow-card tireflow-kpi"><div className="tireflow-kpi-top"><span className="tireflow-kpi-icon red"><TireFlowIcon name="shield"/></span><span className="tireflow-kpi-change" style={{color:"#bd2e2e"}}>Requer análise</span></div><strong>3</strong><p>Movimentações suspeitas</p></article>
      </section>
      <section className="tireflow-grid tireflow-dashboard-grid">
        <article className="tireflow-card"><div className="tireflow-panel-head"><h2>Faturamento nos últimos 12 dias</h2><span className="tireflow-badge">+8,2% no período</span></div><div className="tireflow-chart">{bars.map((height,i)=><div className="tireflow-bar" key={i} style={{height:`${height}%`}}><span>{17+i}/07</span></div>)}</div></article>
        <article className="tireflow-card"><div className="tireflow-panel-head"><h2>Alertas da operação</h2><Link href="/auditoria">Ver todos</Link></div><div className="tireflow-alert-list"><div className="tireflow-alert"><i className="tireflow-alert-dot"/><div><strong>Saída sem venda vinculada</strong><small>1 pneu SportControl 2 • {currency(572)}</small></div><time>19:34</time></div><div className="tireflow-alert"><i className="tireflow-alert-dot orange"/><div><strong>4 produtos abaixo do mínimo</strong><small>Reposição recomendada para hoje</small></div><time>08:05</time></div><div className="tireflow-alert"><i className="tireflow-alert-dot blue"/><div><strong>Inventário aguardando aprovação</strong><small>Contagem do setor B • Rafael Lima</small></div><time>Ontem</time></div></div>
        </article>
      </section>
      <section className="tireflow-card tireflow-table-card" style={{marginTop:14}}><div className="tireflow-panel-head"><h2>Últimas movimentações</h2><Link href="/movimentacoes">Histórico completo</Link></div><div className="tireflow-table-wrap"><table className="tireflow-table"><thead><tr><th>ID</th><th>TIPO</th><th>PRODUTO</th><th>VÍNCULO</th><th>RESPONSÁVEL</th><th>HORÁRIO</th><th>RISCO</th></tr></thead><tbody>{demoMovements.slice(0,4).map(m=><tr key={m.id}><td><strong>{m.id}</strong></td><td><span className={`tireflow-badge ${m.type==="Saída"?"orange":m.type==="Estorno"?"gray":""}`}>{m.type}</span></td><td><strong>{m.product}</strong><small>{m.identification}</small></td><td>{m.linkedTo}</td><td><strong>{m.employee}</strong><small>{m.role}</small></td><td>{m.date}<small>{m.time}</small></td><td className={`tireflow-risk ${m.risk}`}>{m.risk}</td></tr>)}</tbody></table></div></section>
    </>
  );
}
