# Migration 3 — RBAC mínimo

Status: implementada e aplicada no Neon exclusivo do TireFlow em
`20260728233511_minimal_organizational_rbac`.

## 1. Objetivo e limites

A Migration 3 introduzirá autorização mínima por papel organizacional sobre a
fundação já existente de identidade global, sessão opaca, organização,
membership, loja, `StoreAccess` e contexto ativo revalidado no servidor.

Ela não introduzirá planos, cobrança, assinaturas, white-label, feature flags,
módulos contratados, auditoria definitiva, entidades operacionais, clientes,
fornecedores, produtos, estoque, vendas ou documentos fiscais.

Conceitos distintos:

- **autenticação:** prova de identidade por sessão opaca válida;
- **seleção de contexto:** organização, membership e eventual loja ativas,
  previamente autorizadas e persistidas na sessão;
- **autorização:** decisão server-side sobre uma ação específica;
- **papel:** conjunto fixo de permissões da membership dentro da organização;
- **permissão:** chave estável que representa uma capacidade;
- **acesso à loja:** delimitação adicional por `StoreAccess`; não é papel;
- **status ativo:** pré-condição independente de papel e permissão;
- **ownership:** papel `OWNER` com regras não delegáveis e proteção de último
  proprietário;
- **bootstrap:** criação futura e explícita dos primeiros registros; não faz
  parte desta migration.

Autenticar não seleciona tenant. Selecionar contexto não concede automaticamente
uma ação. Papel não contorna status nem `StoreAccess`.

`Session` não recebe papel, permissões, cache persistente de autorização nem
indicador administrativo. Uma mudança de papel produz efeito na próxima
autorização porque o papel atual é lido da membership em cada operação.

## 2. Decisão de modelagem

### 2.1 Estratégia escolhida

Adotar a **Estratégia A**:

```text
OrganizationMembership.role: OrganizationRole
```

com enum:

```text
OWNER
ADMIN
MANAGER
OPERATOR
VIEWER
```

Cada membership possui exatamente um papel organizacional. As permissões são
derivadas de uma matriz fixa, imutável em runtime, versionada em TypeScript.

### 2.2 Justificativa

O MVP possui cinco papéis conhecidos, não permite papéis personalizados e não
precisa editar permissões em runtime. Criar agora `Role`, `Permission`,
`RolePermission` e `MembershipRole` acrescentaria:

- quatro tabelas, FKs, seeds e fluxos administrativos;
- estados inválidos, como membership sem papel ou com combinações conflitantes;
- maior superfície para escalada de privilégio;
- dependência de cache/invalidação para uma matriz que ainda é estática;
- custo de auditoria e manutenção sem valor demonstrativo imediato.

O papel direto é mais simples de consultar, negar por padrão, testar e auditar.
Uma alteração de papel é uma única atualização tenant-aware. A evolução futura
continua possível: criar catálogo configurável, preencher atribuições a partir
do enum, fazer leitura dupla durante transição e só então retirar a coluna.

Não serão criados papéis diferentes por loja. O papel é organizacional;
`StoreAccess` limita a superfície operacional; as permissões do papel somente
valem nas lojas explicitamente autorizadas.

### 2.3 Alteração Prisma proposta

```prisma
enum OrganizationRole {
  OWNER
  ADMIN
  MANAGER
  OPERATOR
  VIEWER

  @@map("organization_role")
}

model OrganizationMembership {
  // campos atuais
  role OrganizationRole @default(VIEWER)

  @@index(
    [organizationId, status, role],
    map: "organization_memberships_organization_status_role_idx"
  )
}
```

`role` será obrigatório com default `VIEWER`. Nunca usar `OWNER` como default.
O default restritivo torna upgrade e inserções antigas seguros: nenhum registro
ganha administração por omissão. O banco está vazio, portanto não é necessário
backfill em etapas; conceitualmente, PostgreSQL preencherá memberships
preexistentes com `VIEWER`.

A migration não altera as FKs compostas existentes. A coluna não participa das
chaves referenciadas por `Session` ou `StoreAccess`. Relações continuam com
`ON DELETE RESTRICT`.

## 3. Escopos de autorização

### 3.1 Organizacional

Não exige loja ativa, mas exige sessão, usuário, organização e membership ativos.
Abrange gestão de memberships, papéis, acessos a lojas, ownership e relatórios
consolidados.

### 3.2 Loja

Exige também loja ativa, pertencente à organização ativa, e `StoreAccess`
`ACTIVE` para a membership. Abrange cadastros operacionais, estoque, operações
locais e relatórios da loja.

Até mesmo `OWNER` precisa de uma linha explícita de `StoreAccess`. Não existe
bypass por papel, `allStores` implícito nem enumeração livre de loja. Para atuar
em todas as lojas, o owner recebe uma linha ativa por loja.

Transferência entre lojas exigirá acesso explícito às duas lojas. Como a sessão
possui uma loja ativa, o futuro caso de uso resolverá a outra loja por consulta
tenant-aware e validará ambos os acessos na mesma transação.

## 4. Catálogo mínimo de permissões

As chaves são literais TypeScript fechadas. Chave desconhecida é negada.

| Chave | Escopo | Finalidade |
|---|---|---|
| `records.read` | loja | visualizar cadastros |
| `records.create` | loja | criar cadastros |
| `records.update` | loja | editar cadastros |
| `records.deactivate` | loja | inativar cadastros |
| `records.hard_delete` | loja | exclusão física futura |
| `inventory.read` | loja | visualizar estoque |
| `inventory.entry.create` | loja | registrar entrada |
| `inventory.exit.create` | loja | registrar saída |
| `inventory.adjust` | loja | ajustar saldo |
| `inventory.transfer` | loja dupla | transferir entre lojas autorizadas |
| `inventory.history.read` | loja | visualizar histórico |
| `inventory.reverse` | loja | estornar movimento |
| `costs.read` | loja | visualizar custo de aquisição |
| `costs.update` | loja | editar custos |
| `margins.read` | loja | visualizar margem |
| `financial.totals.read` | organização | visualizar totais financeiros |
| `financial.export` | organização | exportar dados financeiros |
| `operations.cancel` | loja | cancelar operação |
| `operations.reverse` | loja | estornar operação |
| `operations.adjust.approve` | loja | aprovar ajuste |
| `operations.reopen` | loja | reabrir operação encerrada |
| `sensitive_history.read` | organização | visualizar histórico sensível |
| `reports.read` | loja | visualizar relatórios da loja |
| `reports.export` | loja | exportar relatórios da loja |
| `reports.organization.read` | organização | consolidado de todas as lojas |
| `organization.members.invite` | organização | convidar usuário |
| `organization.members.read` | organização | visualizar memberships |
| `organization.members.role.update` | organização | alterar papel |
| `organization.members.suspend` | organização | suspender membership |
| `organization.members.reactivate` | organização | reativar membership |
| `organization.members.remove` | organização | revogar/remover membership |
| `stores.access.grant` | organização | conceder acesso a loja |
| `stores.access.revoke` | organização | revogar acesso a loja |
| `organization.ownership.transfer` | organização | transferir ownership |

`records.hard_delete` fica negada para todos. A chave reserva a decisão explícita:
nenhum módulo futuro poderá assumir que exclusão física decorre de editar ou
inativar. `sensitive_history.read` representa a leitura sensível disponível antes
da auditoria definitiva, não cria `AuditLog`.

## 5. Matriz completa

Legenda: `✓` permitido; `—` negado. Todo `✓` de escopo loja ainda exige
`StoreAccess` ativo. A matriz não substitui as regras especiais da seção 7.

| Permissão | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|
| `records.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `records.create` | ✓ | ✓ | ✓ | ✓ | — |
| `records.update` | ✓ | ✓ | ✓ | ✓ | — |
| `records.deactivate` | ✓ | ✓ | ✓ | — | — |
| `records.hard_delete` | — | — | — | — | — |
| `inventory.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.entry.create` | ✓ | ✓ | ✓ | ✓ | — |
| `inventory.exit.create` | ✓ | ✓ | ✓ | ✓ | — |
| `inventory.adjust` | ✓ | ✓ | ✓ | — | — |
| `inventory.transfer` | ✓ | ✓ | ✓ | — | — |
| `inventory.history.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `inventory.reverse` | ✓ | ✓ | ✓ | — | — |
| `costs.read` | ✓ | ✓ | ✓ | — | — |
| `costs.update` | ✓ | ✓ | — | — | — |
| `margins.read` | ✓ | ✓ | ✓ | — | — |
| `financial.totals.read` | ✓ | ✓ | ✓ | — | — |
| `financial.export` | ✓ | ✓ | — | — | — |
| `operations.cancel` | ✓ | ✓ | ✓ | — | — |
| `operations.reverse` | ✓ | ✓ | ✓ | — | — |
| `operations.adjust.approve` | ✓ | ✓ | ✓ | — | — |
| `operations.reopen` | ✓ | ✓ | — | — | — |
| `sensitive_history.read` | ✓ | ✓ | — | — | — |
| `reports.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `reports.export` | ✓ | ✓ | ✓ | — | — |
| `reports.organization.read` | ✓ | ✓ | ✓ | — | — |
| `organization.members.invite` | ✓ | ✓ | — | — | — |
| `organization.members.read` | ✓ | ✓ | ✓ | — | — |
| `organization.members.role.update` | ✓ | ✓ | — | — | — |
| `organization.members.suspend` | ✓ | ✓ | — | — | — |
| `organization.members.reactivate` | ✓ | ✓ | — | — | — |
| `organization.members.remove` | ✓ | ✓ | — | — | — |
| `stores.access.grant` | ✓ | ✓ | — | — | — |
| `stores.access.revoke` | ✓ | ✓ | — | — | — |
| `organization.ownership.transfer` | ✓ | — | — | — | — |

Decisões deliberadas:

- `OPERATOR` pode criar e editar cadastros rotineiros, mas não inativá-los;
- `OPERATOR` registra entradas e saídas, mas não ajusta, transfere ou estorna;
- `OPERATOR` não vê custos, margens nem totais financeiros;
- `MANAGER` vê custos/margens e consolidados, mas não edita custos nem administra
  papéis;
- `ADMIN` administra memberships, respeitando limites de hierarquia e ownership;
- `VIEWER` possui somente leitura não sensível;
- exclusão física é negada a todos;
- `OWNER` não recebe acesso implícito a lojas.

## 6. Fonte e evolução da matriz

A implementação futura deverá exportar:

```text
type PermissionKey = ... união literal fechada
ROLE_PERMISSIONS: Readonly<Record<OrganizationRole, ReadonlySet<PermissionKey>>>
PERMISSION_SCOPE: Readonly<Record<PermissionKey, "ORGANIZATION" | "STORE" | "TWO_STORES">>
```

Atualizações ocorrerão por revisão de código, testes e versionamento Git. Não
existirá endpoint para editar a matriz. Testes de snapshot/conjuntos exatos
impedirão concessões acidentais, e testes negativos garantirão negação de chave
desconhecida.

Uma evolução para papéis configuráveis deverá ser uma migration própria, com:

1. tabelas novas sem remover o enum;
2. papéis equivalentes criados a partir da matriz versionada;
3. atribuições preenchidas a partir de `membership.role`;
4. comparação entre decisões antiga e nova;
5. mudança controlada da fonte de leitura;
6. remoção posterior, nunca na mesma implantação.

## 7. Hierarquia e prevenção de escalada

Hierarquia para comparação de limite de atribuição:

```text
OWNER > ADMIN > MANAGER > OPERATOR > VIEWER
```

A hierarquia não autoriza isoladamente. Primeiro a ação exige sua permission key;
depois regras explícitas validam ator, alvo e papel solicitado.

Regras:

- `OWNER` pode atribuir `ADMIN`, `MANAGER`, `OPERATOR` e `VIEWER`;
- criar outro `OWNER` ocorre somente pelo fluxo explícito de ownership;
- `ADMIN` pode atribuir no máximo `ADMIN`, mas não pode promover a si próprio,
  criar `OWNER`, alterar um `OWNER` ou conceder privilégio que não possui;
- `MANAGER`, `OPERATOR` e `VIEWER` não alteram papéis;
- ninguém eleva o próprio papel;
- ninguém suspende, revoga, remove ou muda o papel de alvo com papel superior;
- um `ADMIN` não altera outro `ADMIN` para contornar separação administrativa;
- apenas `OWNER` opera sobre membership `OWNER`;
- alvo é buscado desde o início por `(id, activeOrganizationId)`;
- ator e alvo são revalidados na mesma transação da alteração;
- falha usa erro neutro e não revela existência em outro tenant.

`canManageMembership()` e `canAssignRole()` são políticas adicionais, não
atalhos para `roleRank >= targetRoleRank`.

## 8. Proteção do último OWNER

Múltiplos owners são permitidos. Deve existir pelo menos uma membership com:

```text
organizationId = organização ativa
status = ACTIVE
role = OWNER
```

Suspensão, revogação, remoção, rebaixamento ou saída voluntária de owner usam
uma transação curta e um **advisory transaction lock por organização** antes de
ler ou modificar owners. A chave usa os primeiros 64 bits do UUID, separados em
dois inteiros assinados de 32 bits:

```sql
SELECT pg_advisory_xact_lock(
  (('x' || substr(replace($organizationId::text, '-', ''), 1, 8))::bit(32)::int),
  (('x' || substr(replace($organizationId::text, '-', ''), 9, 8))::bit(32)::int)
);
```

Depois do lock:

1. revalidar sessão, ator e organização;
2. buscar e bloquear as memberships `OWNER` relevantes com
   `SELECT ... FOR UPDATE`;
3. contar owners `ACTIVE`;
4. negar se a operação deixaria zero;
5. aplicar a alteração;
6. confirmar novamente a existência de owner ativo antes do commit.

Todas as mutações de papel/status de owner e transferências usam a mesma função
de lock, inclusive quando aparentemente adicionam owner. Isso serializa as
decisões por organização e evita que duas requisições rebaixem owners diferentes
simultaneamente. A conversão não usa `hashtext`, locale ou `hashCode` de
JavaScript: ela é determinística sobre o texto canônico do UUID. Dois UUIDs com
os mesmos 64 bits iniciais colidem de forma segura, causando apenas serialização
adicional; nunca concessão de acesso. O lock é compatível com PostgreSQL/Neon e
é executado por `$queryRaw` dentro da mesma transação Prisma.

As mutações de papel, status e ownership usam isolamento `Serializable` como
defesa adicional. Um conflito de serialização encerra uma das operações sem
alteração parcial; o chamador poderá repetir de forma limitada em uma camada
posterior. Isso não substitui o lock comum a todos os fluxos de ownership.

## 9. Transferência de ownership

O fluxo `transferOwnership` será organizacional, atômico e reservado a `OWNER`:

1. resolver sessão opaca e contexto organizacional ativo;
2. obter advisory lock da organização;
3. revalidar ator como `OWNER` ativo;
4. buscar destino por ID e organização ativa na mesma consulta;
5. exigir destino `ACTIVE`;
6. rejeitar destino suspenso, revogado, externo ou já owner quando a operação
   solicitada não produzir mudança;
7. promover o destino a `OWNER`;
8. por opção explícita, manter o ator owner ou rebaixá-lo para um papel permitido;
9. confirmar pelo menos um owner ativo;
10. commit único.

O padrão seguro é **manter o owner atual**. Rebaixá-lo exige parâmetro explícito
e validação no mesmo fluxo. Uma promoção avulsa a `OWNER` fora deste caso de uso
é proibida.

## 10. Suspensão, revogação e reativação

- `SUSPENDED`: bloqueio reversível; não concede autorização.
- `REVOKED`: vínculo encerrado; não concede autorização.
- reativação: exige permissão, contexto tenant-aware e preserva o papel anterior,
  salvo decisão explícita autorizada na mesma transação.
- `StoreAccess` pode ser preservado por histórico, mas é inutilizável enquanto a
  membership não estiver ativa.
- toda autorização revalida membership; sessões existentes falham na próxima
  leitura, sem depender de expiração.
- o serviço pode limpar o contexto das sessões afetadas na mesma transação como
  higiene, mas a segurança não depende dessa limpeza.

Suspender/revogar owner passa pela proteção da seção 8. Reativar membership com
papel `OWNER` também usa o lock para manter uma ordem única de mutações sensíveis.

## 11. Camada server-side proposta

Interfaces conceituais:

```text
getAuthorizationContext(opaqueToken)
hasPermission(context, permission)
requirePermission(context, permission)
requireOrganizationPermission(opaqueToken, permission)
requireStorePermission(opaqueToken, permission)
canManageMembership(actorContext, target, action)
canAssignRole(actorContext, target, requestedRole)
```

`AuthorizationContext` é uma fotografia segura e efêmera de uma única operação,
não um cache persistente. `getAuthorizationContext()` resolve novamente:

1. hash HMAC do token opaco e sessão válida;
2. usuário `ACTIVE`;
3. organização ativa obtida do contexto persistido;
4. membership ativa do usuário na organização;
5. papel atual lido do banco;
6. loja ativa, quando presente;
7. loja ativa e pertencente à organização;
8. `StoreAccess ACTIVE` para membership e loja.

O DTO interno contém apenas IDs validados, papel atual e dados mínimos para
decisão. Não retorna `tokenHash`, `passwordHash`, `contextVersion`, razões
internas ou matriz completa ao cliente.

`requireOrganizationPermission()` rejeita permissões de loja.
`requireStorePermission()` exige loja ativa e `StoreAccess`. Permissões
`TWO_STORES` exigem validação explícita da loja de destino além da loja ativa.

O frontend pode receber capacidades derivadas para UX, mas botão, rota, papel,
permission key, `organizationId` ou `storeId` enviados pelo cliente nunca são
prova de autorização.

## 12. IDOR e isolamento

Toda consulta administrativa deriva `activeOrganizationId` do contexto validado.
IDs recebidos representam somente intenção. O padrão é:

```text
findFirst({
  where: {
    id: targetMembershipId,
    organizationId: authorizationContext.organizationId
  }
})
```

É proibido buscar alvo apenas pelo ID e aplicar filtro tenant depois. Não revelar
se o alvo existe em outra organização. Usar o mesmo erro neutro para inexistente,
externo, inativo ou não autorizado quando a distinção não for necessária.

Operações de loja usam organização, membership e loja na consulta, revalidam as
FKs/status e nunca aceitam a organização do payload. Um papel válido falha se:

- não há loja ativa;
- loja está inativa ou é de outro tenant;
- `StoreAccess` não existe, está inativo ou revogado;
- o contexto ficou obsoleto;
- uma transferência inclui loja sem acesso explícito.

## 13. Plano de testes

### 13.1 Matriz

- cada papel possui exatamente o conjunto documentado;
- `VIEWER` não possui escrita;
- `OPERATOR` não vê custos, margem ou totais;
- `MANAGER` não administra owners ou papéis;
- `ADMIN` não promove para `OWNER`;
- `OWNER` possui as permissões previstas;
- `records.hard_delete` é negada a todos;
- chave desconhecida é negada por padrão;
- escopo organizacional não é aceito como permissão de loja e vice-versa.

### 13.2 Sessão, contexto e status

- sessão ausente, inválida, expirada ou revogada;
- usuário inativo;
- organização inativa;
- membership suspensa ou revogada;
- loja inativa;
- `StoreAccess` inativo ou revogado;
- contexto sem loja para ação de loja;
- contexto válido sem loja para ação organizacional;
- contexto inicialmente válido falha imediatamente após cada desativação.

### 13.3 Tenant e IDOR

- membership, usuário e loja de outro tenant;
- alteração de papel com ID externo;
- payload com `organizationId` ou `storeId` forjado;
- resposta neutra sem enumeração;
- nenhuma mutation ocorre antes de concluir o filtro tenant-aware.

### 13.4 Escalada

- autoelevação;
- `ADMIN` promovendo para `OWNER`;
- `ADMIN` alterando owner ou outro admin;
- `MANAGER` promovendo para `ADMIN`;
- ator atribuindo papel superior ao permitido;
- alteração em outro tenant;
- promoção a owner fora de `transferOwnership`;
- revalidação do papel do ator dentro da transação.

### 13.5 Último OWNER e concorrência

- rebaixamento, suspensão, revogação, remoção e saída do último owner bloqueados;
- duas operações concorrentes não deixam zero owner;
- transferência válida;
- transferência para membership inativa/externa rejeitada;
- múltiplos owners permitidos;
- remoção de um owner permitida quando outro ativo permanece;
- opção de manter ou rebaixar owner anterior;
- rollback integral em falha intermediária;
- todos os fluxos sensíveis adquirem o mesmo advisory lock.

### 13.6 Loja

- ação operacional em loja autorizada;
- loja sem acesso ou de outro tenant;
- acesso revogado após seleção;
- papel válido sem `StoreAccess`;
- `OWNER` sem acesso explícito é rejeitado;
- transferência exige acesso às duas lojas.

Os testes de integração usarão dados fictícios, transações/cleanup controlado e
confirmarão zero resíduos.

## 14. SQL esperado

A futura migration conterá somente, em alto nível:

```sql
CREATE TYPE organization_role
  AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER');

ALTER TABLE organization_memberships
  ADD COLUMN role organization_role NOT NULL DEFAULT 'VIEWER';

CREATE INDEX organization_memberships_organization_status_role_idx
  ON organization_memberships (organization_id, status, role);
```

O SQL real manterá nomes citados e quoting do padrão Prisma. Não haverá tabela de
papéis, permissões, planos, módulos, cobrança ou operação. Não haverá seed,
usuário, organização, owner ou `StoreAccess`.

Antes de aplicar, o SQL gerado será revisado para confirmar que não derruba ou
recria constraints compostas das migrations anteriores. A migration usará a
conexão direta; runtime continuará na pooled.

## 15. Bootstrap futuro

Uma etapa separada, idempotente e explicitamente autorizada deverá:

1. criar ou localizar usuário por e-mail normalizado;
2. criar ou localizar organização por slug;
3. criar ou localizar loja por `(organizationId, code)`;
4. criar ou localizar membership com `role = OWNER`;
5. criar ou localizar `StoreAccess`;
6. não reativar nem sobrescrever registros deliberadamente alterados;
7. obter senha/segredo de entrada local segura;
8. nunca executar automaticamente em produção.

Não haverá seed da Sena nem owner padrão nesta migration.

## 16. Auditoria futura

Sem criar tabela agora, os serviços deverão futuramente emitir evento na mesma
transação para:

- alteração de papel;
- suspensão, revogação e reativação;
- concessão e revogação de acesso a loja;
- transferência de ownership;
- tentativa bloqueada de escalada;
- tentativa de operar em outro tenant.

Até a auditoria definitiva existir, logs comuns não devem conter token, hash,
senha, detalhes que enumerem outro tenant ou payload sensível.

## 17. Compatibilidade

O desenho usa enum/coluna/índice nativos e transações PostgreSQL, compatíveis com:

- Node.js 24;
- Next.js 16;
- Prisma 7.9.1;
- PostgreSQL gerenciado no Neon;
- `@prisma/adapter-pg`;
- conexão pooled no runtime;
- conexão direta para migrations;
- migrations 1 e 2 já aplicadas.

Não exige dependência nova nem Auth.js.

## 18. Riscos e limitações

| Risco/limitação | Tratamento |
|---|---|
| matriz fixa não permite papel personalizado | decisão intencional do MVP; evolução descrita na seção 6 |
| enum PostgreSQL exige migration para novo papel | papéis são raros e mudanças devem ser revisadas |
| papel único por organização | suficiente para MVP; evita união de privilégios inesperada |
| sem papel por loja | `StoreAccess` limita superfície; evolução somente com caso real |
| `VIEWER` default pode reduzir acesso em upgrade | fail-safe; promoção deve ser explícita |
| advisory lock omitido em um fluxo | centralizar mutações de owner e testar aquisição do lock |
| permissões futuras sem entidade operacional | chaves apenas preparam política; não criam tabelas |
| sem auditoria definitiva | ações críticas são catalogadas; implementação depende da migration futura |
| capabilities expostas ao frontend ficam obsoletas | servem apenas para UX; servidor reautoriza toda ação |
| alteração direta no banco contorna serviço | restringir privilégios operacionais e auditar futuramente |

## 19. Decisões fechadas e pendências

Decisões fechadas para implementação futura:

- papel direto e obrigatório em `OrganizationMembership`;
- default `VIEWER`;
- cinco papéis fixos;
- matriz TypeScript fixa e deny-by-default;
- papel organizacional único;
- `StoreAccess` explícito inclusive para `OWNER`;
- múltiplos owners, mínimo de um ativo;
- transferência de ownership como único fluxo de promoção a `OWNER`;
- advisory transaction lock por organização em toda mutação de owner;
- nenhuma tabela ou seed novo além do enum/coluna/índice.

Não há decisão arquitetural crítica pendente. A migration, a matriz, o
`AuthorizationContext`, os serviços administrativos e os testes foram
implementados conforme este documento. Bootstrap, interface visual, auditoria
definitiva e módulos operacionais permanecem fora do escopo.
