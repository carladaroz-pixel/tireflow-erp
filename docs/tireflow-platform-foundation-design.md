# TireFlow ERP — desenho técnico da Fundação da Plataforma

**Status:** proposta para revisão  
**Escopo:** arquitetura e especificação; nenhuma implementação de banco, autenticação ou API  
**Produto:** SaaS modular para borracharias, auto centers, lojas de pneus, centros automotivos e oficinas mecânicas leves

## 1. Resumo executivo

O TireFlow será uma plataforma SaaS multiempresa e multilojas. A identidade global de uma pessoa (`User`) será separada de seu vínculo com cada empresa (`OrganizationMembership`), das lojas às quais tem acesso (`StoreAccess`) e das funções que exerce (`MembershipRole`). Contratação comercial, autorização e liberação técnica serão verificações independentes.

O isolamento primário será por `organizationId`. Entidades operacionais de loja também carregarão `storeId`; entidades de estoque físico carregarão `warehouseId` e, quando necessário, `storageLocationId`. O servidor obterá esses identificadores de um contexto validado a partir da sessão, nunca aceitará um `organizationId` do cliente como prova de autorização e nunca dependerá de ocultação na interface.

Movimentações de estoque, auditoria, histórico financeiro, estornos e histórico de assinatura serão imutáveis. Saldos serão projeções transacionais de movimentos, não valores editáveis de forma isolada. Migrations serão pequenas e seeds serão idempotentes e fictícios.

### Resultado arquitetural esperado

```text
Plataforma TireFlow
├── Catálogo global
│   ├── permissões
│   ├── planos
│   ├── módulos
│   ├── funcionalidades
│   └── feature flags técnicas
└── Organização cliente
    ├── identidade visual
    ├── assinatura e entitlements
    ├── memberships, funções e permissões
    └── lojas
        ├── acessos por membership
        ├── depósitos
        │   └── posições físicas
        ├── saldos e movimentações
        ├── caixas
        └── operações
```

## 2. Princípios arquiteturais

1. **Tenant explícito no servidor:** toda operação tenant-scoped recebe `TenantContext` criado pelo backend.
2. **Negação por padrão:** falta de membership, loja, módulo, feature ou permissão resulta em negação.
3. **Defesa em profundidade:** filtros, FKs compostas, índices, transações, autorização e testes protegem o isolamento.
4. **Identidade não é membership:** uma conta global pode participar de várias organizações com estados e funções diferentes.
5. **RBAC não é assinatura:** permissão do usuário não concede módulo não contratado.
6. **Loja não é depósito:** loja é unidade empresarial; depósito é unidade física de estoque; posição é um endereço dentro do depósito.
7. **Eventos críticos são append-only:** correções produzem novos registros compensatórios.
8. **Auditoria é parte da operação:** para ações críticas, log e alteração confirmam na mesma transação.
9. **IDs não autorizam:** conhecer um UUID não concede acesso.
10. **Dados demonstrativos nunca são reais:** seeds usam domínios reservados e documentos claramente fictícios.
11. **Datas em UTC:** persistência em UTC; apresentação na timezone da loja ou organização.
12. **Evolução incremental:** migrations pequenas, contratos versionados e compatibilidade com o protótipo.

## 3. Arquitetura multiempresa

### 3.1 Classificação de escopo

| Escopo | Entidades principais | Chaves obrigatórias |
|---|---|---|
| Plataforma global | `User`, `Permission`, `Plan`, `Module`, `Feature`, `FeatureFlag` | nenhuma chave de tenant |
| Organização | `OrganizationMembership`, `Role`, `OrganizationBranding`, `OrganizationSubscription`, `OrganizationModule`, `OrganizationFeatureOverride`, `AuditLog` | `organizationId` |
| Loja | `StoreAccess`, operações, caixas, ordens e documentos futuros | `organizationId`, `storeId` |
| Depósito | `Warehouse`, `StorageLocation`, `InventoryBalance`, `InventoryMovement` | `organizationId`, `storeId`, `warehouseId` |
| Plataforma administrativa | comandos de suporte e provisionamento | contexto `PlatformActor`, separado de membership |

`Organization` é globalmente endereçável, porém seus dados pertencem ao tenant. Tabelas de junção globais, como `PlanModule`, não carregam `organizationId`; tabelas de contratação carregam.

### 3.2 Regras de propagação

- Todo modelo pertencente ao tenant possui `organizationId NOT NULL`.
- Todo modelo de loja possui também `storeId NOT NULL`, salvo cadastros compartilhados por toda a organização.
- Relações tenant-scoped devem preferir FKs compostas, por exemplo:
  `(organizationId, storeId) -> Store(organizationId, id)`.
- Índices de consulta começam por `organizationId`; consultas de loja começam por `(organizationId, storeId)`.
- Um filho nunca referencia apenas o `id` do pai quando isso permitir combinação entre organizações.
- DTOs de criação não expõem `organizationId`; o serviço o injeta a partir do contexto.

### 3.3 Camada obrigatória de acesso

O código de aplicação não deverá usar um cliente Prisma irrestrito em handlers. A implementação futura terá:

```text
request
  -> authenticate()
  -> resolveTenantContext()
  -> requireSubscription()
  -> requireModuleAndFeature()
  -> requirePermission()
  -> tenantRepository(context)
  -> transaction + audit
```

`tenantRepository` exige `organizationId` no construtor e oferece somente métodos tenant-aware. Operações globais ficam em um repositório de plataforma separado e acessível apenas a `PlatformActor`.

Uma extensão Prisma pode acrescentar filtros, mas não será a única barreira: operações sensíveis usarão métodos explícitos, FKs compostas e testes de vazamento. Métodos perigosos (`findUnique({id})`, `update({id})`) não deverão aparecer em handlers tenant-scoped.

### 3.4 Prevenção de acesso cruzado

- Resolver o tenant da sessão e membership, não do corpo da requisição.
- Validar que `store.organizationId === context.organizationId`.
- Buscar entidades com chave composta tenant-aware.
- Retornar `404` para recursos de outro tenant quando a existência não deve ser revelada.
- Retornar `403` quando a identidade do recurso é pública, mas a ação é proibida.
- Aplicar escopo igualmente a leitura, escrita, contagem, exportação, busca, auditoria e jobs.
- Carregar jobs assíncronos com `organizationId` assinado no payload e revalidar o tenant no consumidor.
- Aplicar PostgreSQL Row Level Security às tabelas tenant-scoped a partir da Migration 2 como defesa adicional, sem substituir autorização, FKs ou filtros da aplicação.

### 3.5 Administradores da plataforma

Administradores da plataforma não serão memberships especiais. Terão uma associação global separada, por exemplo `PlatformUserRole`, com permissões de suporte. Acesso assistido a um tenant exigirá:

- motivo;
- duração limitada;
- ticket ou referência;
- banner de impersonação;
- log global e log no tenant;
- proibição de visualizar segredos;
- elevação explícita para escrita.

Não haverá “superadmin invisível”.

### 3.6 Usuários em várias organizações

`User` armazena identidade e credenciais. `OrganizationMembership` armazena estado e atributos do vínculo. Uma suspensão em A não encerra memberships ativas em B. A sessão mantém o usuário global e referências à organização/loja ativas, sempre revalidadas no banco.

## 4. Contexto de tenant e fluxo seguro

### 4.1 Estrutura proposta

```ts
type TenantContext = {
  userId: string;
  sessionId: string;
  organizationId: string;
  membershipId: string;
  storeId?: string;
  permissionKeys: Set<string>;
  moduleKeys: Set<string>;
  featureKeys: Set<string>;
  requestId: string;
};
```

O contexto é criado exclusivamente no servidor e não é serializado como fonte de autoridade no navegador.

### 4.2 Fluxo

1. **Autenticação:** cookie opaco identifica uma sessão armazenada no servidor.
2. **Organizações permitidas:** backend consulta memberships ativas do usuário.
3. **Organização ativa:** usuário seleciona uma membership permitida; o servidor grava a seleção na sessão.
4. **Loja ativa:** no primeiro MVP, o backend lista apenas lojas com uma linha explícita em `StoreAccess`. Uma futura capacidade “todas as lojas” deverá ser materializada em acessos ou modelada por uma política própria; não haverá booleano implícito sem constraint.
5. **Validação:** em cada request, revalida sessão, usuário, membership, organização, assinatura e loja.
6. **Execução:** repositório recebe o contexto e injeta as chaves de escopo.
7. **Auditoria:** registra ator, membership, tenant, loja, request e resultado.

O cliente pode enviar uma intenção de troca (`membershipId`, `storeId`), nunca um `organizationId` arbitrário como autorização. A troca deve rotacionar ou atualizar a sessão server-side e invalidar caches do contexto anterior.

## 5. Organização, loja, depósito e estoque

### 5.1 Organization

Representa a empresa contratante.

Campos: `id`, `legalName`, `tradeName`, `slug`, `documentType`, `documentNumber`, `email`, `phone`, `status`, `timezone`, `currency`, `locale`, `createdAt`, `updatedAt`, `deletedAt?`.

Regras:

- `slug` globalmente único.
- documento normalizado e único quando informado, condicionado a tipo e país.
- `status`: `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `CLOSED`.
- fechamento não apaga histórico.
- timezone IANA, moeda ISO 4217 e locale BCP 47.

### 5.2 Store

Unidade operacional de uma organização.

Campos: `id`, `organizationId`, `name`, `code`, `documentNumber?`, `phone?`, `email?`, endereço estruturado, `timezone`, `status`, `isHeadquarters`, timestamps.

Regras:

- `@@unique([organizationId, code])`.
- apenas uma matriz por organização; índice parcial.
- loja sempre pertence à organização do contexto.
- endereço não será um JSON opaco se houver necessidade de busca fiscal/geográfica.

### 5.3 Hierarquia física

| Conceito | Responsabilidade |
|---|---|
| `Store` | unidade empresarial e operacional |
| `Warehouse` | agrupador físico/lógico de estoque de uma loja |
| `StorageLocation` | endereço interno: corredor, estante, posição |
| `InventoryBalance` | projeção agregada atual por item/local |
| `InventoryMovement` | fato imutável que explica toda variação |

Depósitos iniciais poderão ter tipos `MAIN`, `SHOP_FLOOR`, `ASSEMBLY`, `RESERVED`, `DAMAGED`, `RETURNS`, `TRANSIT`.

### 5.4 Regra de saldo

O saldo nunca é alterado sem movimento. A transação:

1. valida contexto, item, depósito e localização;
2. bloqueia ou serializa a linha de saldo;
3. valida disponibilidade;
4. cria `InventoryMovement`;
5. atualiza `InventoryBalance`;
6. cria auditoria;
7. confirma tudo junto.

Transferências geram ao menos dois movimentos correlacionados (saída e entrada) ligados por `transferGroupId`. Estorno referencia `reversalOfMovementId`; não edita o movimento original.

## 6. Autenticação e sessões

### 6.1 Recomendação

Usar uma biblioteca de autenticação compatível com Next.js e adaptador PostgreSQL, com sessão opaca em banco. A candidata preferencial na implementação será **Auth.js**, após uma prova técnica com Next.js 16; alternativa: serviço próprio restrito com sessões opacas, caso o adapter não cumpra rotação e contexto multi-tenant.

Não usar JWT longo como fonte autossuficiente de autorização: permissões, membership e assinatura mudam e precisam de revogação imediata.

### 6.2 Entidades

- `User`: identidade global.
- `UserCredential`: hash e política de senha, separado para reduzir exposição.
- `Session`: token hasheado, usuário, expiração, revogação e contexto ativo.
- `EmailVerificationToken` e `PasswordResetToken`: ficam para uma migration
  futura, quando os respectivos fluxos forem implementados.
- `LoginAttempt`: agregação para bloqueio/rate limit; poderá evoluir para storage especializado.
- `OrganizationMembership` e `StoreAccess`: autorização organizacional.

`Account` só será criado se futuramente houver OAuth ou outro provedor.

### 6.3 Controles

- Hash de senha com Argon2id; bcrypt é alternativa quando o ambiente não suportar Argon2.
- Parâmetros versionados para rehash progressivo.
- Token de sessão aleatório de alta entropia; apenas hash no banco.
- Cookie `httpOnly`, `secure` em produção, `sameSite=lax`, path `/`, sem domínio amplo.
- Expiração absoluta e inatividade; rotação após login, troca de organização e elevação.
- Revogação por sessão e “encerrar todas”.
- Alteração de senha, e-mail, MFA futuro ou suspensão revoga sessões.
- CSRF por same-site + token/origin check em mutações sensíveis.
- Mensagens neutras para impedir enumeração de e-mails.
- Bloqueio progressivo por conta e IP, com auditoria.
- Tokens de e-mail e recuperação hasheados, uso único e sem registro em log.

## 7. RBAC e permissões

### 7.1 Modelo

- `Permission`: catálogo global de chaves estáveis.
- `Role`: função da organização; funções padrão são clonadas ou marcadas como template.
- `RolePermission`: relação N:N.
- `MembershipRole`: funções exercidas pela membership.
- `StoreAccess`: lojas permitidas; pode limitar acesso sem duplicar a função.
- Futuro `ApprovalPolicy`: ações que exigem aprovação adicional.

Não haverá lógica baseada no texto “GERENTE”. O código pergunta por chaves como `inventory.adjust`. Nomes de função são apresentação.

### 7.2 Ordem de autorização

```text
sessão válida
AND usuário ativo
AND membership ativa
AND organização ativa
AND assinatura compatível
AND módulo/feature habilitado
AND loja autorizada
AND permissão concedida
AND aprovação adicional (se aplicável)
```

### 7.3 Matriz inicial

Legenda: `✓` permitido, `L` limitado às lojas autorizadas, `A` exige aprovação, `—` negado.

| Capacidade | Plat. admin | Proprietário | Org. admin | Gerente | Atendente | Estoquista | Técnico | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gerir plataforma/planos globais | ✓ | — | — | — | — | — | — | — |
| Ver organização | suporte | ✓ | ✓ | ✓ | L | L | L | L |
| Gerir organização/branding | suporte | ✓ | ✓ | — | — | — | — | — |
| Gerir lojas | suporte | ✓ | ✓ | L | — | — | — | — |
| Convidar/gerir usuários | suporte | ✓ | ✓ | L | — | — | — | — |
| Gerir funções/permissões | suporte | ✓ | ✓ | — | — | — | — | — |
| Ver produtos/estoque | suporte | ✓ | ✓ | L | L | L | L | L |
| Criar/alterar produto | suporte | ✓ | ✓ | L | — | L | — | — |
| Receber/expedir estoque | suporte | ✓ | ✓ | L | — | L | consumo OS | — |
| Ajustar estoque | suporte | ✓ | ✓ | A/L | — | A/L | — | — |
| Estornar movimento | suporte | ✓ | ✓ | A/L | — | — | — | — |
| Ver auditoria | suporte | ✓ | ✓ | L | — | — | — | L |
| Gerir assinatura | ✓ | ✓ | consulta | — | — | — | — | consulta |

Administrador da plataforma não recebe acesso operacional automático: “suporte” exige sessão assistida auditada.

### 7.4 Restrições não delegáveis

- Apenas plataforma altera catálogo global de permissões, planos, módulos e feature flags globais.
- Membership não concede permissões além das habilitadas para sua organização.
- Ninguém apaga auditoria, movimento ou registro financeiro.
- Um usuário não aprova a própria ação quando a política exigir segregação.
- Org admin não promove usuário a platform admin.

## 8. Auditoria imutável

### 8.1 AuditLog

Campos: `id`, `organizationId?`, `storeId?`, `actorUserId?`, `actorMembershipId?`, `action`, `entityType`, `entityId?`, `previousData?`, `newData?`, `metadata?`, `ipAddressHash?`, `ipAddressPrefix?`, `userAgent?`, `requestId`, `createdAt`.

`organizationId` é opcional somente para eventos genuinamente globais. Logs tenant-scoped sempre o exigem.

### 8.2 Regras

- Aplicação possui permissão de `INSERT`, não de `UPDATE/DELETE`, quando o modelo de banco permitir.
- Logs críticos são gravados na mesma transação.
- Serialização usa allowlist/redaction: senha, hashes, tokens, cookies, chaves, documentos completos e dados de pagamento não entram.
- `previousData` e `newData` registram apenas campos relevantes.
- IP será pseudonimizado com HMAC rotacionável e, se necessário para segurança, prefixo reduzido; IP integral não entra no JSON de auditoria. `userAgent` será truncado, normalizado e submetido à política de retenção para reduzir fingerprinting.
- Exportação de auditoria também é auditada.
- Retenção é política da plataforma e legal; não é exclusão feita pelo cliente.
- Futuro particionamento por data/organização para volume.

### 8.3 Ações obrigatórias

| Domínio | Ações |
|---|---|
| Autenticação | login bem-sucedido/falho relevante, logout, reset, revogação, bloqueio |
| Tenant | criação, suspensão, reativação, alteração crítica |
| Membership | convite, aceite, suspensão, remoção |
| RBAC | criar/alterar função, conceder/remover permissão, atribuir/remover função |
| Loja | criar, alterar, suspender, alterar acesso |
| Assinatura | contratar, mudar plano, suspender, cancelar, override |
| White-label | alteração de marca, domínio e contatos |
| Estoque | entrada, saída, transferência, ajuste, estorno, tentativa negada crítica |
| Auditoria | consulta/exportação sensível |
| Suporte | impersonação, elevação, leitura ou escrita assistida |

## 9. White-label

`OrganizationBranding` terá relação 1:1 com organização.

Campos: `organizationId`, `displayName`, `logoAssetId?`, `faviconAssetId?`, `primaryColor?`, `secondaryColor?`, `accentColor?`, `customDomain?`, endereço/contatos exibidos, `footerText?`, `commercialSettings?`, timestamps.

Regras:

- fallback para marca TireFlow e iniciais da organização.
- cores apenas em `#RRGGBB`, com validação de contraste para texto e controles.
- arquivos futuros em object storage privado/público controlado, referenciados por `Asset`; nunca base64 no banco.
- cache por `organizationId + branding.updatedAt`, com invalidação após mudança.
- domínio normalizado e globalmente único; ativação exige verificação de posse.
- lookup de branding sempre pelo tenant/domínio resolvido pelo servidor.
- `commercialSettings` pode começar como JSON validado e versionado; dados consultáveis devem virar colunas/tabelas.

## 10. Planos, módulos, funcionalidades e feature flags

| Conceito | Finalidade | Exemplo |
|---|---|---|
| Plano | pacote comercial | Essencial, Profissional |
| Módulo | domínio funcional contratado | Estoque, Financeiro |
| Feature | capacidade comercial granular | transferências entre lojas |
| Subscription | contrato vigente da organização | Profissional mensal |
| OrganizationModule | concessão explícita/estado de módulo | Estoque ativo |
| Feature override | exceção comercial por organização | QR Code liberado |
| Feature flag | controle técnico de rollout/kill switch | novo motor de inventário |

### 10.1 Avaliação no backend

1. assinatura está `ACTIVE` ou em tolerância explicitamente permitida;
2. módulo pertence ao plano ou foi concedido;
3. feature pertence ao plano/módulo ou possui override;
4. feature flag técnica permite uso no ambiente/tenant;
5. membership possui permissão;
6. store access cobre a loja;
7. política de aprovação é satisfeita.

Menus podem usar o mesmo resultado para UX, mas o backend repete a verificação.

### 10.2 Precedência

```text
kill switch global OFF
  > flag técnica por ambiente/tenant
  > override comercial explícito
  > entitlement do plano
  > permissão RBAC
```

Uma flag técnica não deve cobrar nem conceder direitos comerciais. RBAC não habilita produto não contratado.

## 11. Catálogo proposto de entidades

Convenções: IDs UUIDv7 gerados pela aplicação/camada Prisma e persistidos como `uuid` nativo; timestamps UTC; `createdAt` obrigatório; `updatedAt` onde mutável. A implementação não dependerá de extensão do Neon para gerar IDs. Inserts fora do Prisma deverão fornecer UUIDv7 válido explicitamente.

### 11.1 Identidade e sessão

#### User

- **Finalidade:** identidade global.
- **Campos:** `id`, `email`, `emailNormalized`, `name`, `status`, `emailVerifiedAt?`, timestamps.
- **Unicidade/índices:** `emailNormalized` único; índice por status.
- **Relações:** credentials, sessions, memberships.
- **Exclusão:** desativação/anonymization controlada; não cascade para histórico.
- **Escopo:** global.

#### UserCredential

- **Campos:** `userId`, `passwordHash`, `hashVersion`, `passwordChangedAt`, timestamps.
- **Unicidade:** `userId` único.
- **Exclusão:** acompanha encerramento controlado de identidade.
- **Escopo:** global e altamente restrito.

#### Session

- **Campos:** `id`, `userId`, `tokenHash`, `activeMembershipId?`, `activeStoreId?`, `expiresAt`, `lastSeenAt`, `revokedAt?`, `ipHash?`, `userAgent?`, timestamps.
- **Índices:** `tokenHash` único, `(userId, revokedAt)`, `expiresAt`.
- **Integridade do contexto ativo:** `activeMembershipId` deriva a organização; `activeStoreId` só pode coexistir se houver `StoreAccess` para a mesma membership. No MVP, isso será protegido por FK composta opcional `(activeMembershipId, activeStoreId) -> StoreAccess(membershipId, storeId)` e revalidação no servidor. Não armazenar um `activeOrganizationId` independente evita estados divergentes.
- **Ordem de migration:** a Migration 1 cria `Session` sem os campos de contexto ativo. A Migration 2 adiciona `activeMembershipId` e `activeStoreId` depois de criar `OrganizationMembership`, `Store` e `StoreAccess`.
- **Exclusão:** expiração/limpeza após retenção; revogação lógica imediata.
- **Escopo:** global; contexto ativo é revalidado.

#### EmailVerificationToken / PasswordResetToken

Não fazem parte da Migration 1. Serão modelados em migration futura, com tokens
hasheados, uso único e retenção curta, somente quando os fluxos de verificação de
e-mail e recuperação de senha forem implementados.

### 11.2 Organização

#### Organization

- Campos e regras da seção 5.1.
- Índices: slug único, documento normalizado; status.
- Exclusão: fechamento/soft delete; sem cascade destrutivo.
- Escopo: raiz de tenant.

#### OrganizationMembership

- **Campos:** `id`, `organizationId`, `userId`, `status`, `joinedAt?`, `suspendedAt?`, `invitedByMembershipId?`, timestamps.
- **Unique:** `(organizationId, userId)`.
- **Índices:** `(userId, status)`, `(organizationId, status)`.
- **Relações:** roles, store accesses, audit actor.
- **Exclusão:** status `REMOVED`; preservar histórico.
- **Escopo:** organização.

#### Store

- Campos e regras da seção 5.2.
- Unique `(organizationId, id)` adicional para FKs compostas.
- Exclusão: inativação; proibir quando houver operações abertas.

#### StoreAccess

- **Campos:** `organizationId`, `membershipId`, `storeId`, `accessLevel?`, timestamps.
- **Unique:** `(membershipId, storeId)`.
- **FKs compostas:** membership e store na mesma organização.
- **MVP:** toda loja permitida possui uma linha explícita; não existe bypass `allStores`.
- **Exclusão:** revogação auditada; histórico de evento preservado.
- **Escopo:** organização/loja.

### 11.3 RBAC

#### Permission

- **Campos:** `id`, `key`, `description`, `scopeType`, `riskLevel`, `active`, timestamps.
- **Unique:** `key`.
- **Exclusão:** inativação; não apagar se referenciada.
- **Escopo:** global.

#### Role

- **Campos:** `id`, `organizationId`, `name`, `key?`, `description?`, `isSystem`, `active`, timestamps.
- **Unique:** `(organizationId, name)` e opcional `(organizationId, key)`.
- **Exclusão:** inativação; restringir se atribuída.
- **Escopo:** organização.

#### RolePermission

- **Campos:** `organizationId`, `roleId`, `permissionId`, `constraints?`, `createdAt`.
- **PK/unique:** `(roleId, permissionId)`.
- **FK composta:** role na organização.
- **Exclusão:** remoção auditada.

#### MembershipRole

- **Campos:** `organizationId`, `membershipId`, `roleId`, timestamps, `grantedByMembershipId`.
- **Unique:** `(membershipId, roleId)`.
- **FKs:** todos na mesma organização.
- **Exclusão:** revogação auditada.

#### PlatformRole / PlatformRolePermission / UserPlatformRole

- **Finalidade:** autorização administrativa global sem transformar platform admin em membership de todos os tenants.
- **Campos principais:** `PlatformRole(id, key, name, active)`, junção com `Permission` de `scopeType=PLATFORM` e junção com `User`, incluindo `grantedByUserId`, `expiresAt?` e timestamps.
- **Unicidade:** role key global; `(platformRoleId, permissionId)`; `(userId, platformRoleId)`.
- **Relações:** apenas usuários globais e permissões de plataforma; nunca `organizationId`.
- **Exclusão:** revogação/inativação auditada; concessões históricas não são apagadas silenciosamente.
- **Migration:** entra na Migration 3, junto do RBAC, e permite validar `createdByPlatformUserId` nos overrides comerciais.
- **Escopo:** plataforma global, totalmente separado de `Role` tenant-scoped.

### 11.4 White-label

#### OrganizationBranding

- Campos da seção 9.
- **Unique:** `organizationId`; `customDomain` globalmente único quando verificado.
- **Exclusão:** reset para padrão; histórico em auditoria.

### 11.5 Comercial

#### Plan

- **Campos:** `id`, `key`, `name`, `description`, `status`, `version`, timestamps.
- **Unique:** `(key, version)`.
- **Exclusão:** inativação; contratos antigos preservam referência.
- **Escopo:** global.

#### Module

- **Campos:** `id`, `key`, `name`, `description`, `status`, timestamps.
- **Unique:** `key`.
- **Escopo:** global.

#### Feature

- **Campos:** `id`, `moduleId`, `key`, `name`, `description`, `status`.
- **Unique:** `key`; índice por módulo.
- **Escopo:** global.

#### PlanModule

- **Campos:** `planId`, `moduleId`, `limits?`.
- **PK:** `(planId, moduleId)`.
- **Escopo:** global.

#### PlanFeature

- **Campos:** `planId`, `featureId`, `limits?`.
- **PK:** `(planId, featureId)`.
- **Escopo:** global.

#### OrganizationSubscription

- **Campos:** `id`, `organizationId`, `planId`, `status`, `startsAt`, `endsAt?`, `trialEndsAt?`, `cancelledAt?`, `metadata?`, timestamps.
- **Índices:** `(organizationId, status)`, datas.
- **Constraint:** uma assinatura vigente por organização via índice parcial.
- **Exclusão:** nunca apagar; novo registro para mudança histórica.

#### OrganizationModule

- **Campos:** `id`, `organizationId`, `moduleId`, `status`, `source`, `startsAt`, `endsAt?`, timestamps.
- **Unique:** versão vigente por organização/módulo; histórico preservado.

#### OrganizationFeatureOverride

- **Campos:** `id`, `organizationId`, `featureId`, `enabled`, `reason`, `startsAt`, `endsAt?`, `createdByPlatformUserId`.
- **Índices:** tenant/feature/período.
- **Exclusão:** nunca apagar; expirar ou compensar.

#### FeatureFlag

- **Campos:** `id`, `key`, `description`, `enabled`, `environment`, `rolloutPercentage`, `rules`, timestamps.
- **Unique:** `(key, environment)`.
- **Escopo:** plataforma; regras podem selecionar tenants sem virar entitlement.

### 11.6 Estrutura de estoque

#### Warehouse

- **Campos:** `id`, `organizationId`, `storeId`, `code`, `name`, `type`, `status`, timestamps.
- **Unique:** `(organizationId, storeId, code)`.
- **FK:** store composta.
- **Exclusão:** inativação; impedir com saldo não zero.
- **Escopo:** loja.

#### StorageLocation

- **Campos:** `id`, `organizationId`, `storeId`, `warehouseId`, `code`, `description?`, `status`, `allowsNegativeStock=false`, timestamps.
- **Unique:** `(organizationId, warehouseId, code)`.
- **FK composta:** warehouse/store/organization.
- **Exclusão:** inativação; impedir com saldo/reserva.

#### InventoryBalance

- **Campos:** `id`, `organizationId`, `storeId`, `warehouseId`, `storageLocationId?`, `stockItemId`, `onHand`, `reserved`, `version`, `updatedAt`.
- **Unique:** combinação item/local.
- **Constraints:** quantidades não negativas salvo política explícita; `reserved <= onHand`.
- **Exclusão:** não apagar enquanto houver histórico; zerado pode ser arquivado futuramente.

#### InventoryMovement

- **Campos:** `id`, escopo completo, `stockItemId`, `type`, `quantity`, `unitCost?`, `reasonCode`, `sourceType?`, `sourceId?`, `transferGroupId?`, `reversalOfMovementId?`, `idempotencyKey?`, `actorMembershipId`, `occurredAt`, `createdAt`.
- **Índices:** tenant/data, item/data, source, transfer, reversão.
- **Constraints:** quantidade positiva; direção derivada do tipo; reversão única quando aplicável.
- **Exclusão:** nunca.

`stockItemId` será definido na fase operacional (produto agregado ou unidade serializada), sem acoplar prematuramente a fundação. Por isso, `InventoryBalance` e `InventoryMovement` são contratos aprovados, mas **não entram nas sete migrations da Fundação**. A Migration 6 cria somente `Warehouse` e `StorageLocation`; saldo e movimento serão criados depois de `Product/StockItem`, na fase operacional, preservando estes campos e invariantes.

#### AuditLog

- Campos e políticas da seção 8.
- Índices: `(organizationId, createdAt DESC)`, `(organizationId, entityType, entityId, createdAt)`, `requestId`, ator/data.
- Exclusão: nunca pela aplicação.

## 12. Diagrama textual de entidades

```text
User 1──N Session
User 1──1 UserCredential
User 1──N OrganizationMembership N──1 Organization

Organization 1──1 OrganizationBranding
Organization 1──N Store
Organization 1──N Role
Organization 1──N OrganizationSubscription
Organization 1──N OrganizationModule
Organization 1──N OrganizationFeatureOverride
Organization 1──N AuditLog

OrganizationMembership N──N Role
  via MembershipRole
Role N──N Permission
  via RolePermission
OrganizationMembership N──N Store
  via StoreAccess

Plan N──N Module
  via PlanModule
Plan N──N Feature
  via PlanFeature
Module 1──N Feature

Store 1──N Warehouse
Warehouse 1──N StorageLocation
StorageLocation 1──N InventoryBalance
InventoryBalance 1──N InventoryMovement (por stockItem/local)

InventoryMovement 0..1──1 InventoryMovement
  reversalOfMovement
```

## 13. Índices e constraints

### 13.1 Obrigatórios

- `Organization.slug UNIQUE`.
- documento normalizado com unique aplicável.
- todo pai tenant-scoped referenciado por FK composta terá uma chave candidata explícita, normalmente `UNIQUE(organizationId, id)`, mesmo que `id` já seja globalmente único;
- `Store UNIQUE(organizationId, code)`.
- `Store UNIQUE(organizationId, id)` para relações compostas.
- `OrganizationMembership UNIQUE(organizationId, id)` e `UNIQUE(organizationId, userId)`.
- `Role UNIQUE(organizationId, id)`.
- `Warehouse UNIQUE(organizationId, storeId, id)`.
- `StorageLocation UNIQUE(organizationId, storeId, warehouseId, id)` quando referenciada por esse escopo completo.
- `StoreAccess UNIQUE(membershipId, storeId)`.
- `Role UNIQUE(organizationId, name)`.
- `Permission.key UNIQUE`.
- `Warehouse UNIQUE(organizationId, storeId, code)`.
- `StorageLocation UNIQUE(organizationId, warehouseId, code)`.
- todos os índices operacionais iniciam por `organizationId`.
- audit por tenant/data e entidade.
- idempotência: `UNIQUE(organizationId, idempotencyKey)` quando informada.

### 13.2 Exigem SQL customizado

| Regra | Mecanismo provável |
|---|---|
| uma matriz por organização | índice parcial `WHERE is_headquarters` |
| uma assinatura ativa/vigente | índice parcial por status |
| um override vigente por feature | exclusion/partial index + validação transacional |
| impossibilidade de UPDATE/DELETE em auditoria | privilégios de banco e/ou trigger |
| reversão única de movimento | índice parcial em `reversalOfMovementId` |
| FKs tenant-aware | constraints compostas criadas/revisadas na migration |
| saldo não negativo concorrente | lock/version + transação, não apenas CHECK |
| domínio único apenas quando verificado | índice parcial |

Prisma não expressa todos os índices parciais, políticas RLS ou privilégios; migrations SQL revisadas serão necessárias.

### 13.3 Implementabilidade das FKs compostas

PostgreSQL exige que as colunas referenciadas sejam uma PK ou `UNIQUE` na mesma ordem. Prisma exige que o `references` aponte para `@id`, `@unique` ou `@@unique`. Portanto:

- todos os campos da relação terão o mesmo tipo e nulabilidade compatível;
- o pai declarará `@@unique([organizationId, id])` ou a chave composta completa;
- o filho declarará `organizationId` junto do ID do pai;
- relações de loja/warehouse usarão o escopo completo para impedir combinação cruzada;
- migrations inspecionarão o SQL gerado, pois redundância de `id` global + unique composto é intencional;
- testes tentarão inserir diretamente relações A→B e deverão falhar no banco, não apenas no serviço.

Não usar `relationMode = "prisma"`: a Fundação depende de FKs reais no PostgreSQL.

Relações críticas usarão o mesmo padrão: `AuditLog.actorMembershipId`, `AuditLog.storeId`, `InventoryMovement.actorMembershipId`, `MembershipRole.grantedByMembershipId` e acessos de loja devem incluir `organizationId` na FK. Assim, mesmo inserts SQL diretos não poderão combinar ator, loja ou entidade de organizações distintas.

### 13.4 RLS no Neon

RLS será defesa adicional nas tabelas tenant-scoped a partir da Migration 2. A implementação deverá:

- usar role de runtime sem `BYPASSRLS`;
- definir tenant por transação com `set_config('app.organization_id', ..., true)`;
- usar `current_setting('app.organization_id', true)` nas policies;
- manter role separada e restrita para migrations;
- nunca reutilizar conexão pooled com variável de sessão persistente fora de transação;
- testar ausência de contexto, contexto A/B e jobs administrativos;
- manter autorização da aplicação e FKs compostas mesmo com RLS.

O spike técnico deve confirmar o comportamento do Prisma com pooling do Neon antes de habilitar policies em produção. A Migration 1 contém entidades globais e não depende de RLS.

## 14. Soft delete, status e retenção

### 14.1 Nunca apagar

- `InventoryMovement`;
- reversões;
- `AuditLog`;
- lançamentos financeiros futuros;
- histórico de assinatura/módulo;
- eventos de concessão/revogação relevantes;
- aceitações e documentos fiscais futuros.

### 14.2 Inativar ou soft delete

- organização, loja, warehouse e location: status e eventual `deletedAt`.
- usuário: `status`; anonimização conforme obrigação legal.
- membership: `REMOVED`/`SUSPENDED`.
- produto futuro: `INACTIVE`, preservando histórico.
- role: inativação.

Soft delete indiscriminado aumenta complexidade de unique constraints, consultas e vazamento acidental. Só será usado quando houver requisito de restauração; para históricos, estados e eventos são preferíveis.

## 15. Integridade, concorrência e transações

### 15.1 Operações obrigatoriamente transacionais

- organização + branding + primeira loja + owner membership;
- convite/aceite + membership + store access + role;
- concessão/revogação de função;
- troca de contexto ativo;
- entrada, saída, transferência, ajuste e estorno;
- alteração de plano, módulo e override;
- suspensão de usuário/membership + revogação de sessões;
- ação crítica + auditoria.

### 15.2 Estratégia

- transação curta;
- lock pessimista em saldo crítico ou optimistic concurrency com `version`;
- tentativa condicional de update (`onHand >= quantidade`);
- unique idempotency key;
- reprocessamento retorna resultado anterior, não duplica;
- isolamento `Serializable` apenas onde necessário; retry limitado para conflitos;
- movimento e saldo confirmam juntos;
- side effects externos futuros usam outbox transacional;
- valores monetários em inteiro de menor unidade; quantidades em `Decimal` com escala definida.

### 15.3 Transferência

Um cabeçalho futuro `InventoryTransfer` pode controlar workflow. Na confirmação, saída, entrada, saldos e auditoria são atômicos. Transferência entre lojas valida acesso às duas lojas e pode exigir aprovação; estoque em trânsito usa warehouse lógico próprio.

## 16. Estratégia de migrations

| Migration | Tabelas/objetos | Dependências | Seed inicial | Risco/testes |
|---|---|---|---|---|
| 1 — Identidade e sessão global | User, UserCredential, Session sem contexto ativo | nenhuma | nenhum | email único, hash de token, expiração e revogação |
| 2 — Estrutura organizacional | Organization, Membership, Store, StoreAccess; adiciona contexto ativo à Session | migration 1 | organização, owner e duas lojas fictícias opcionais | FKs tenant-aware, contexto de sessão, acesso cruzado |
| 3 — RBAC | Permission, Role, RolePermission, MembershipRole, PlatformRole e junções globais | migration 2 | permissões e funções padrão | escalada e revogação |
| 4 — White-label | OrganizationBranding, referência futura a Asset | organization | branding demo | fallback, domínio/cor |
| 5 — Comercial | Plan, Module, Feature, junções, Subscription, entitlements, flags | organization | planos/módulos/features demo | precedência e assinatura única |
| 6 — Estrutura de estoque | Warehouse, StorageLocation; contratos para saldo/movimento | store | warehouses/locations demo | FKs compostas e códigos |
| 7 — Auditoria | AuditLog, índices, privilégios/trigger | user, membership, store | nenhum log artificial obrigatório | imutabilidade e redaction |

### 16.1 Rollback lógico

Produção não dependerá de “down migration” destrutiva. Rollback:

- aplicação compatível com versão N-1 quando possível;
- feature flag desativa uso novo;
- colunas/tabelas adicionadas permanecem;
- correção por migration forward;
- backup/restauração só para incidente grave.

Cada migration terá teste em banco vazio, banco com seed e upgrade a partir da anterior. SQL customizado será revisado separadamente.

## 17. Seeds demonstrativos

Seeds serão `upsert` por chaves estáveis:

- permissões globais por `key`;
- módulos e features por `key`;
- planos por `(key, version)`;
- funções por `(organizationId, key)`;
- organização `autocenter-demo`;
- lojas `MATRIZ` e `FILIAL-01`;
- usuários `owner@tireflow.example`, `manager@tireflow.example`, `stock@tireflow.example`;
- depósitos `PRINCIPAL`, `MONTAGEM`, `DANIFICADOS`;
- branding fictício.

`.example` é domínio reservado. Documentos serão valores sintaticamente marcados como demonstração e nunca da Sena, Carla ou cliente real. Senhas de seed só em ambiente local/teste, obtidas de configuração explícita ou geradas e exibidas uma vez; nunca hardcoded para produção.

IDs UUIDv7 gerados na primeira execução serão recuperados nas seguintes por chaves naturais estáveis: `slug`, `emailNormalized`, `key`, `(key, version)` e códigos compostos. Junções usarão `upsert` por seus uniques compostos. Reexecução não troca senha, não reativa registros deliberadamente suspensos e não sobrescreve customizações do usuário.

Teste de idempotência: executar seed duas vezes e comparar contagens, chaves e campos que não podem ser sobrescritos.

## 18. Plano de testes

### 18.1 Pirâmide

- **Unitários:** regras de permissionamento, entitlements, redaction, transições de status.
- **Integração PostgreSQL:** repositories, constraints, concorrência, transactions, tenant leakage.
- **E2E:** login, seleção de contexto, rotas protegidas e fluxos críticos.

Recomendação futura: Vitest para unitários/integração, PostgreSQL descartável via Testcontainers, Playwright para E2E.

### 18.2 Isolamento de organização

- A não lista, busca, conta, exporta ou agrega dados de B.
- A não altera, remove ou relaciona IDs de B.
- troca manual de ID retorna 404/403 sem vazamento.
- relação composta impede filho A/pai B.
- jobs e auditoria mantêm tenant.
- plataforma exige contexto elevado explícito.
- snapshots/queries de teste verificam presença do filtro.

### 18.3 Isolamento de loja

- membership restrita à loja A não lê/escreve B.
- membership multi-loja alterna com revalidação.
- warehouse/location nunca cruza store.
- operação permanece na loja de criação.
- troca de loja limpa caches.

### 18.4 RBAC

- permitido/negado;
- múltiplas roles unem permissões sem ultrapassar entitlement;
- role alterada reflete imediatamente;
- membership suspensa ou removida perde acesso;
- store access revogado;
- função customizada;
- aprovação separa solicitante/aprovador.

### 18.5 Assinatura e módulos

- assinatura ativa, suspensa, expirada e em trial;
- módulo contratado/não contratado;
- feature incluída/ausente;
- override habilita/desabilita;
- kill switch prevalece;
- permissão sem contratação continua negada.

### 18.6 Auditoria

- log criado com ator/contexto/request;
- before/after corretos;
- redaction de senha/token;
- rollback da operação remove log da transação falha;
- UPDATE/DELETE negados;
- exportação auditada;
- ação negada relevante registrada.

### 18.7 Autenticação

- login válido/inválido sem enumeração;
- user inativo;
- membership suspensa;
- sessão expirada/revogada;
- rotação;
- troca autorizada/não autorizada de organização/loja;
- CSRF;
- reset de senha de uso único;
- alteração crítica encerra sessões.

### 18.8 Concorrência

- duas saídas simultâneas não tornam saldo negativo;
- mesma idempotency key cria um movimento;
- transferência parcial faz rollback;
- estorno concorrente ocorre uma vez;
- retry de serialização é limitado e observável.

## 19. Checklist de segurança

- [ ] Argon2id e parâmetros versionados.
- [ ] Tokens aleatórios e hasheados.
- [ ] Cookies `httpOnly`, `secure`, `sameSite`, escopo mínimo.
- [ ] CSRF em mutações.
- [ ] validação de entrada por schema e rejeição de campos desconhecidos.
- [ ] autorização server-side em toda operação.
- [ ] tenant derivado da sessão.
- [ ] prevenção de mass assignment.
- [ ] prevenção de IDOR com chaves compostas e contexto.
- [ ] mensagens antienumeração.
- [ ] rate limiting para login, reset, convites e exportações.
- [ ] headers CSP, HSTS, frame/content policies.
- [ ] erros públicos neutros; detalhes apenas em logs estruturados.
- [ ] redaction centralizada.
- [ ] nenhuma credencial em auditoria ou logs.
- [ ] rotação/revogação de sessão.
- [ ] dependências auditadas e atualização planejada.
- [ ] separação de credenciais por ambiente.
- [ ] plataforma admin separado de tenant admin.
- [ ] backups testados e criptografia em trânsito/repouso.
- [ ] uploads futuros com allowlist, limite, antivírus e nomes aleatórios.

## 20. Decisões técnicas

| Tema | Recomendação | Alternativas | Justificativa |
|---|---|---|---|
| PostgreSQL | Neon gerenciado em projeto exclusivo TireFlow, com conexões separadas para runtime e migrations | outro serviço gerenciado | constraints, transações, branching de teste e isolamento do produto |
| Prisma | ORM principal + SQL em migrations especiais | Drizzle, SQL direto | produtividade e tipos; admitir limites de partial index/RLS |
| Autenticação | camada própria restrita para credenciais e sessões opacas | Auth.js/adapter para OAuth futuro | a POC confirmou que Credentials + database session não é fluxo suportado pelo Auth.js |
| Sessão | token opaco + registro server-side | JWT curto | mudanças de permissão/tenant imediatas |
| IDs | UUIDv7 gerado na aplicação/Prisma e `uuid` nativo no PostgreSQL | CUID2, UUIDv4 | independente de extensão Neon e interoperável |
| JSON | somente metadata/config versionada | tabelas normalizadas | campos consultáveis e integridade ficam relacionais |
| Soft delete | seletivo | status/eventos | evita filtro universal e uniques problemáticos |
| Domínio tenant | slug no primeiro MVP; domínio custom futuro | subdomínio desde início | reduz complexidade antes de verificação DNS/TLS |
| TenantContext | sessão + membership/store revalidados | header organizationId | não confia no cliente |
| Autorização | serviço/policy central + repositories tenant-aware | checks espalhados | consistência e testabilidade |
| Logs | JSON estruturado com requestId e redaction | texto livre | correlação e segurança |
| Testes | Vitest + Testcontainers + Playwright | Jest | integração real com PostgreSQL e boa compatibilidade TS |
| Transações | serviços de domínio; outbox futuro | callbacks ad hoc | atomicidade e efeitos externos seguros |
| Datas | UTC no banco, IANA por store | horário local persistido | DST e relatórios multilojas |
| Arquivos | object storage + tabela Asset | filesystem local | SaaS escalável, URLs assinadas e isolamento |

### 20.1 Decisões adotadas

- PostgreSQL Neon em projeto exclusivo do TireFlow.
- `DATABASE_URL` pooled para runtime e `DIRECT_DATABASE_URL` direta para migrations/administração.
- Prisma models em PascalCase, campos em camelCase, tabelas/colunas PostgreSQL em snake_case plural por `@map`/`@@map`.
- constraints e índices SQL customizados com nomes explícitos e estáveis.
- UUIDv7 gerado na aplicação/camada Prisma, armazenado em `uuid` nativo.
- datas em UTC.
- slug como resolução inicial de organização.
- RLS adicional com `SET LOCAL` dentro da transação; nunca contexto permanente em conexão pooled.
- sessão própria opaca em banco para login por credenciais; Auth.js não será usado neste fluxo da Migration 1.
- MFA fora do MVP, mas sem impedir evolução.
- arquivos futuros em object storage.

### 20.2 Decisões pendentes

1. Política comercial de grace period e suspensão.
2. Requisitos legais de retenção e LGPD.
3. Escopo inicial de aprovação dual para estoque.

## 21. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| consulta sem tenant | vazamento crítico | repository obrigatório, FKs, testes e RLS adicional |
| misturar RBAC e plano | acesso/cobrança incorretos | pipeline de autorização separado |
| função “admin” hardcoded | rigidez e escalada | permission keys e roles configuráveis |
| JSON excessivo | baixa integridade | normalizar dados consultáveis |
| soft delete universal | vazamentos e uniques | uso seletivo |
| saldo derivado incorreto | perda financeira | movimento imutável + transaction + reconciliação |
| auditoria com segredo | incidente de segurança | allowlist/redaction e testes |
| sessões com claims antigos | acesso após revogação | sessão server-side e revalidação |
| migration monolítica | rollback arriscado | sete migrations pequenas |
| protótipo acoplado a mocks | regressão visual | adapters e substituição incremental |
| platform admin irrestrito | abuso interno | suporte just-in-time e dupla auditoria |

## 22. Compatibilidade com o protótipo

| Área atual | Destino |
|---|---|
| Dashboard | permanece visualmente; métricas passam a queries tenant/store-aware |
| Produtos e pneus | permanece; mock vira repository/API real na fase operacional |
| Estoque | permanece; cards passam a saldos/movimentos reais |
| Movimentações | permanece; tabela consome histórico imutável |
| Auditoria | permanece; dados vêm de `AuditLog` e regras de risco |
| Login demo | removido e substituído por autenticação real |
| seletor de perfil local | removido; roles vêm da membership |
| `tireflow-demo-data.ts` | substituído gradualmente por seeds e APIs |
| `tireflow-config.ts` | defaults ficam globais; tenant override migra para branding |
| `TireFlowShell` e ícones | reutilizáveis; receberão contexto real |
| CSS/tema | preservado; variáveis vêm de branding validado |

Para reduzir regressão, criar uma interface de dados entre telas e fontes. Primeiro implementar provider real mantendo o mesmo shape visual; depois remover mocks. Testes de screenshot poderão proteger desktop/mobile. Nenhuma tela será reescrita junto com a primeira migration.

## 23. Critérios de aceite da futura sprint

- [ ] migrations 1–7 pequenas, revisadas e aplicáveis em banco vazio.
- [ ] lint, TypeScript, build e testes passam.
- [ ] A não acessa qualquer dado de B em leitura, escrita, busca ou exportação.
- [ ] usuário possui memberships independentes em múltiplas organizações.
- [ ] membership possui funções diferentes por organização.
- [ ] acesso pode ser limitado a lojas.
- [ ] tenant/store vêm da sessão revalidada.
- [ ] autorização ocorre no servidor.
- [ ] módulo contratado e RBAC são verificações distintas.
- [ ] branding carrega por organização com fallback.
- [ ] sessões são revogáveis e rotacionáveis.
- [ ] auditoria crítica é imutável, redigida e transacional.
- [ ] saldos não mudam sem movimento.
- [ ] idempotência impede duplicação.
- [ ] seeds rodam repetidamente sem duplicar.
- [ ] constraints tenant-aware impedem relações cruzadas.
- [ ] nenhuma funcionalidade visual atual é quebrada.
- [ ] nenhuma credencial ou dado real entra no repositório.

## 24. Sequência recomendada de implementação

1. Registrar ADR da sessão própria e preparar ambiente Neon exclusivo de desenvolvimento/teste.
2. Instalar Prisma e infraestrutura de testes apenas na sprint autorizada.
3. Migration 1 + testes de identidade/sessão.
4. Migration 2 + `TenantContext` + testes de isolamento.
5. Migration 3 + policy engine RBAC.
6. Migration 4 + adapter de branding para o protótipo.
7. Migration 5 + entitlement evaluator.
8. Migration 6 + depósitos/locais, sem substituir ainda as telas.
9. Migration 7 + serviço de auditoria e privilégios.
10. Seeds idempotentes.
11. Autenticação real e troca de contexto.
12. Integração incremental das telas atuais.
13. Teste E2E completo de dois tenants/duas lojas.
14. Revisão de segurança antes de qualquer deploy.

## 25. Checklist de implementação pelo Codex

### Antes de codificar

- [ ] confirmar branch e árvore limpa;
- [ ] registrar ADRs;
- [ ] decidir versões exatas;
- [ ] não copiar secrets;
- [ ] criar plano de migration e rollback forward.

### A cada entidade tenant-scoped

- [ ] `organizationId NOT NULL`;
- [ ] `storeId` quando operacional;
- [ ] FKs compostas;
- [ ] índice iniciado por tenant;
- [ ] política de exclusão;
- [ ] teste A/B;
- [ ] auditoria quando crítica.

### A cada endpoint/ação

- [ ] autenticar;
- [ ] resolver contexto;
- [ ] validar assinatura/módulo/feature;
- [ ] validar store access;
- [ ] validar permission key;
- [ ] rejeitar campos de escopo enviados;
- [ ] transaction/idempotência;
- [ ] redaction e audit;
- [ ] teste permitido e negado.

### A cada migration

- [ ] nome e escopo único;
- [ ] SQL inspecionado;
- [ ] índices/constraints conferidos;
- [ ] teste vazio/upgrade;
- [ ] seed idempotente;
- [ ] sem operação destrutiva não aprovada;
- [ ] documentação atualizada.

### Antes de integrar o protótipo

- [ ] contrato de dados definido;
- [ ] loading/empty/error states;
- [ ] tenant e store visíveis;
- [ ] fallback de branding;
- [ ] nenhuma dependência dos mocks em produção;
- [ ] regressão responsiva verificada.

## 26. Revisão crítica final e prontidão

### 26.1 Contradições corrigidas

1. `Session` não pode referenciar membership/loja na Migration 1: os campos ativos serão adicionados na Migration 2.
2. `allStores` não tinha entidade/constraint: o MVP usa linhas explícitas de `StoreAccess`.
3. FKs compostas exigem uniques compostos nos pais: estes passam a ser obrigatórios e intencionais.
4. `InventoryBalance`/`InventoryMovement` dependem de `StockItem`: permanecem como contrato, fora das sete migrations da Fundação.
5. RLS deixou de ser “possível/futuro”: será defesa adicional a partir da Migration 2, condicionada ao spike de pooling.
6. Administração global ganhou RBAC próprio e separado de roles tenant-scoped.
7. A Migration 1 contém exclusivamente `User`, `UserCredential` e `Session`.
   `Organization` passa a ser criada na Migration 2; tokens de verificação de
   e-mail e recuperação de senha ficam para migration futura.

### 26.2 Decisões que bloqueiam a Migration 1

Os bloqueios de desenho foram resolvidos:

- Auth.js foi rejeitado para credenciais + sessão persistida; a Migration 1 usará sessão própria restrita.
- UUIDv7 será gerado na aplicação/camada Prisma e persistido como `uuid`.
- nomes físicos serão `snake_case` plural por `@map`/`@@map`.
- runtime e migrations usarão URLs Neon distintas.

Antes de **executar** a Migration 1 resta um pré-requisito operacional, não uma decisão arquitetural: fornecer `DATABASE_URL`, `DIRECT_DATABASE_URL` e `AUTH_SECRET` reais em arquivo local ignorado. Nenhum valor real entra no repositório. `User` é global e não possui `organizationId` ou `storeId`; `UserCredential` contém somente o hash e metadados necessários; `Session` é própria do TireFlow e não possui organização, membership ou loja ativa até a Migration 2.

### 26.3 Decisões que não bloqueiam a Migration 1

- grace period e cobrança;
- retenção legal definitiva;
- aprovação dual de estoque;
- MFA;
- domínio personalizado;
- object storage;
- catálogo operacional de produtos/pneus;
- saldos e movimentos;
- política completa de suporte assistido.

### 26.4 Parecer

O desenho está internamente consistente e pronto para orientar a Migration 1. As migrations 2–7 têm ordem válida: identidade global; estrutura tenant e contexto; RBAC; branding; comercial; estrutura física de estoque; auditoria. Nenhuma migration deve ser executada até existir o Neon exclusivo e os segredos locais; nenhuma funcionalidade crítica deve ser exposta antes da Migration 7 e do serviço de auditoria estarem ativos.
