import { logoutAction, selectOrganizationAction, selectStoreAction } from "@/app/actions/auth";
import { getSessionContext, listAvailableOrganizations, listAvailableStores } from "@/lib/auth/context";
import { requireAuthenticatedToken } from "@/lib/auth/web-session";
import { platformConfig } from "@/lib/tireflow-config";

export default async function ContextSelectionPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const token = await requireAuthenticatedToken();
  const organizations = await listAvailableOrganizations(token);
  const context = await getSessionContext(token);
  const stores = context ? await listAvailableStores(token) : [];
  const { erro } = await searchParams;
  return (
    <main className="tireflow-context-wrap">
      <section className="tireflow-context-card">
        <div className="tireflow-brand"><span className="tireflow-brand-mark"><span /></span><span><strong>{platformConfig.productName}</strong><small>{platformConfig.productSuffix}</small></span></div>
        <p className="tireflow-eyebrow">CONTEXTO DE TRABALHO</p>
        <h1>Escolha onde você vai trabalhar</h1>
        <p className="tireflow-subtitle">Somente organizações e lojas autorizadas são exibidas.</p>
        {erro ? <p className="tireflow-form-message" role="alert">{erro}</p> : null}
        {!organizations.length ? (
          <div className="tireflow-empty-state"><strong>Nenhuma organização disponível</strong><p>Seu acesso pode estar suspenso ou ainda não configurado.</p></div>
        ) : (
          <div className="tireflow-context-grid">
            <section>
              <h2>1. Organização</h2>
              {organizations.map(({ organization, membership }) => (
                <form action={selectOrganizationAction} key={membership.id}>
                  <input type="hidden" name="organizationId" value={organization.id} />
                  <button className={`tireflow-context-option ${context?.organization.id === organization.id ? "is-selected" : ""}`}>
                    <span>{organization.tradeName}</span><small>{organization.slug}</small>
                  </button>
                </form>
              ))}
            </section>
            <section>
              <h2>2. Loja</h2>
              {!context ? <p className="tireflow-context-hint">Selecione primeiro uma organização.</p> : !stores.length ? <p className="tireflow-context-hint">Nenhuma loja autorizada disponível.</p> : stores.map((store) => (
                <form action={selectStoreAction} key={store.id}>
                  <input type="hidden" name="storeId" value={store.id} />
                  <button className="tireflow-context-option"><span>{store.name}</span><small>{store.code}</small></button>
                </form>
              ))}
            </section>
          </div>
        )}
        <form action={logoutAction}><button className="tireflow-btn" type="submit">Sair da conta</button></form>
      </section>
    </main>
  );
}
