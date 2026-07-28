# Migration 2 — Estrutura organizacional e contexto ativo

**Status:** implementada no Neon exclusivo do TireFlow pela migration
`20260728215233_organizational_structure_and_session_context`.

## 1. Escopo e decisões

A Migration 2 contém exclusivamente:

- `Organization`;
- `OrganizationMembership`;
- `Store`;
- `StoreAccess`;
- campos e constraints de contexto ativo em `Session`.

`User` continua global e não recebe `organizationId` nem `storeId`. Não entram
nesta migration RBAC, planos, módulos, white-label, auditoria definitiva,
endereços, documentos fiscais, entidades operacionais ou seeds.

Decisões:

1. Acesso a lojas usa **uma linha explícita de `StoreAccess` por loja**
   (estratégia A). Não haverá `hasAllStoresAccess`.
2. `organizationId` é redundante em `StoreAccess` e no contexto da `Session`
   para viabilizar FKs compostas tenant-aware e consultas delimitadas.
3. Os três identificadores de contexto ficam na sessão porque são necessários
   para integridade referencial e consultas eficientes. A redundância não pode
   divergir por causa das FKs e do `CHECK` descritos abaixo.
4. Contexto é cache de uma autorização previamente validada, não fonte absoluta
   de autorização. Toda leitura revalida status e relações.
5. Documento fiscal, endereço completo, timezone por loja e bootstrap real
   ficam para etapas futuras. Documento fiscal envolve regras por país,
   normalização, unicidade e retenção que não devem ser improvisadas nesta
   fundação.

## 2. Enums

### `OrganizationStatus`

- `ACTIVE`
- `INACTIVE`
- `SUSPENDED`

Somente `ACTIVE` autoriza seleção ou uso de contexto.

### `OrganizationMembershipStatus`

- `ACTIVE`
- `SUSPENDED`
- `REVOKED`

Somente `ACTIVE` autoriza acesso. `SUSPENDED` é reversível; `REVOKED` registra
encerramento do vínculo.

### `StoreStatus`

- `ACTIVE`
- `INACTIVE`

Somente `ACTIVE` pode ser loja ativa.

### `StoreAccessStatus`

- `ACTIVE`
- `INACTIVE`
- `REVOKED`

Somente `ACTIVE` autoriza seleção e uso da loja.

Todos os enums serão tipos PostgreSQL em `snake_case`.

## 3. Modelos

IDs são UUIDv7 gerados pela camada Prisma e persistidos como `uuid`. Timestamps
são UTC em `timestamptz(3)`. Modelos usam PascalCase, campos camelCase e
`@map`/`@@map` para nomes físicos em `snake_case`.

### 3.1 `Organization`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | UUID | PK, UUIDv7 |
| `legalName` | varchar(200) | obrigatório |
| `tradeName` | varchar(160) | obrigatório |
| `slug` | varchar(80) | obrigatório, normalizado no serviço |
| `status` | `OrganizationStatus` | default `ACTIVE` |
| `createdAt` | timestamptz | default `now()` |
| `updatedAt` | timestamptz | `@updatedAt` |

Constraints e índices:

- PK `(id)`;
- `UNIQUE (slug)`;
- índice `(status)`.

O slug será lowercase ASCII, com hífens, entre 3 e 80 caracteres. O frontend
pode sugerir, mas o servidor normaliza e valida. Slug não concede acesso.

### 3.2 `OrganizationMembership`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | UUID | PK, UUIDv7 |
| `organizationId` | UUID | obrigatório |
| `userId` | UUID | obrigatório |
| `status` | `OrganizationMembershipStatus` | default `ACTIVE` |
| `joinedAt` | timestamptz | obrigatório, default `now()` |
| `disabledAt` | timestamptz? | preenchido ao suspender/revogar |
| `disabledReason` | varchar(240)? | motivo interno, não retorna em DTO comum |
| `createdAt` | timestamptz | default `now()` |
| `updatedAt` | timestamptz | `@updatedAt` |

Constraints e índices:

- PK `(id)`;
- FK `organizationId -> Organization.id`, `ON DELETE RESTRICT`;
- FK `userId -> User.id`, `ON DELETE RESTRICT`;
- `UNIQUE (organizationId, userId)`;
- `UNIQUE (organizationId, id)`, pai da FK tenant-aware de `StoreAccess`;
- `UNIQUE (organizationId, id, userId)`, pai da FK de contexto da `Session`;
- índice `(userId, status, organizationId)` para organizações disponíveis;
- índice `(organizationId, status)` para administração organizacional.

O unique de três colunas parece redundante em relação à PK, mas é obrigatório
para uma FK composta provar simultaneamente membership, organização e usuário.
Não existe papel organizacional nesta migration; isso pertence ao RBAC.

### 3.3 `Store`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | UUID | PK, UUIDv7 |
| `organizationId` | UUID | obrigatório |
| `name` | varchar(160) | obrigatório |
| `code` | varchar(40) | obrigatório, normalizado no serviço |
| `status` | `StoreStatus` | default `ACTIVE` |
| `isHeadquarters` | boolean | default `false` |
| `createdAt` | timestamptz | default `now()` |
| `updatedAt` | timestamptz | `@updatedAt` |

Constraints e índices:

- PK `(id)`;
- FK `organizationId -> Organization.id`, `ON DELETE RESTRICT`;
- `UNIQUE (organizationId, code)`;
- `UNIQUE (organizationId, id)`, pai de FKs tenant-aware;
- índice `(organizationId, status)`.

O código pode se repetir em organizações diferentes. Endereço e timezone
específico da loja ficam fora da fundação; `isHeadquarters` é apenas
classificação e não concede permissão.

### 3.4 `StoreAccess`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | UUID | PK, UUIDv7 |
| `organizationId` | UUID | obrigatório e redundante intencionalmente |
| `organizationMembershipId` | UUID | obrigatório |
| `storeId` | UUID | obrigatório |
| `status` | `StoreAccessStatus` | default `ACTIVE` |
| `revokedAt` | timestamptz? | histórico de revogação |
| `createdAt` | timestamptz | default `now()` |
| `updatedAt` | timestamptz | `@updatedAt` |

Constraints e índices:

- PK `(id)`;
- FK composta `(organizationId, organizationMembershipId)` para
  `OrganizationMembership(organizationId, id)`, `ON DELETE RESTRICT`;
- FK composta `(organizationId, storeId)` para
  `Store(organizationId, id)`, `ON DELETE RESTRICT`;
- `UNIQUE (organizationMembershipId, storeId)`;
- `UNIQUE (organizationId, organizationMembershipId, storeId)`, pai da FK de
  contexto da `Session`;
- índice `(organizationMembershipId, status, storeId)`;
- índice `(storeId, status, organizationMembershipId)`.

Não é necessária uma terceira FK simples para `Organization`: as duas FKs
compostas já exigem a mesma organização existente nos pais. Evitar essa FK
reduz redundância sem reduzir integridade.

A combinação de FKs torna impossível inserir acesso entre membership da
organização A e loja da organização B, inclusive por SQL direto.

## 4. Alterações em `Session`

Campos novos, todos compatíveis com sessões existentes:

| Campo | Tipo | Regra |
|---|---|---|
| `activeOrganizationId` | UUID? | organização validada |
| `activeOrganizationMembershipId` | UUID? | membership validada do usuário da sessão |
| `activeStoreId` | UUID? | loja validada e autorizada |
| `contextUpdatedAt` | timestamptz? | última troca/limpeza |
| `contextVersion` | integer | default `0`, concorrência otimista |

Não há backfill. Sessões existentes permanecem com os três IDs nulos e token,
hash, expiração e revogação inalterados.

### 4.1 FKs de contexto

1. FK composta:

   ```text
   (
     active_organization_id,
     active_organization_membership_id,
     user_id
   )
   ->
   organization_memberships(
     organization_id,
     id,
     user_id
   )
   ```

   Impede sessão apontar para membership de outro usuário ou organização.

2. FK composta:

   ```text
   (
     active_organization_id,
     active_store_id
   )
   ->
   stores(
     organization_id,
     id
   )
   ```

   Impede loja de outra organização.

3. FK composta:

   ```text
   (
     active_organization_id,
     active_organization_membership_id,
     active_store_id
   )
   ->
   store_accesses(
     organization_id,
     organization_membership_id,
     store_id
   )
   ```

   Quando `activeStoreId` não é nulo, exige acesso correspondente. Status ainda
   precisa ser revalidado no serviço, pois FK não expressa `status = ACTIVE`.

Todas usam `ON DELETE RESTRICT`. Como PostgreSQL usa `MATCH SIMPLE` por padrão,
uma FK composta com coluna nula não é verificada. O `CHECK` abaixo define os
estados nulos permitidos.

### 4.2 `CHECK` de forma do contexto

```sql
CHECK (
  (
    active_organization_id IS NULL
    AND active_organization_membership_id IS NULL
    AND active_store_id IS NULL
  )
  OR
  (
    active_organization_id IS NOT NULL
    AND active_organization_membership_id IS NOT NULL
  )
)
```

Estados válidos:

- sem contexto: organização, membership e loja nulas;
- organização ativa: organização e membership preenchidas, loja nula;
- loja ativa: os três campos preenchidos.

`activeStoreId` sem organização/membership e organização sem membership são
impossíveis no banco.

### 4.3 Índices da sessão

- `(activeOrganizationId, userId)` para sessões afetadas por organização;
- `(activeOrganizationMembershipId)` para invalidação/limpeza por membership;
- `(activeStoreId)` para invalidação/limpeza por loja.

Não será criado índice separado apenas para `activeOrganizationId`, pois ele é
prefixo do primeiro índice.

## 5. Compatibilidade Prisma/PostgreSQL

As uniques compostas e relações multi-coluna são suportadas por PostgreSQL e
Prisma 7.9.1. O schema final deve ser validado em modo `create-only` antes de
aplicar.

O Prisma 7.9.1 aceitou a reutilização dos mesmos campos escalares nas três
relações compostas da `Session`. Foi necessário atribuir nomes físicos
explícitos e distintos às FKs para evitar colisão nos nomes automáticos. As FKs
foram geradas pelo Prisma e existem no catálogo do PostgreSQL; não foi
necessário adicioná-las manualmente.

O `CHECK` de forma do contexto será SQL manual, pois Prisma Schema Language não
modela check constraints. A constraint
`sessions_active_context_shape_check` foi adicionada manualmente ao SQL da
migration. Migrations futuras devem preservá-la e os testes de catálogo devem
detectar sua remoção.

## 6. Resolução server-side

O cookie continua contendo apenas o token opaco. IDs de contexto não entram no
cookie e nunca são aceitos como prova de acesso.

Funções previstas:

- `getAuthenticatedSession(token)`;
- `getSessionContext(token)`;
- `listAvailableOrganizations(token)`;
- `listAvailableStores(token)`;
- `selectOrganizationContext(token, requestedOrganizationId)`;
- `selectStoreContext(token, requestedStoreId)`;
- `clearSessionContext(token)`;
- `requireOrganizationContext(token)`;
- `requireStoreContext(token)`.

Os IDs solicitados representam intenção. Cada função começa resolvendo a
sessão pelo hash do token e retorna mensagens neutras para contexto inexistente
ou não autorizado.

### 6.1 Selecionar organização

Em transação curta:

1. validar token, sessão, expirações, revogação e `User.status`;
2. buscar `OrganizationMembership` por
   `(userId, requestedOrganizationId, status=ACTIVE)`;
3. confirmar `Organization.status=ACTIVE`;
4. executar `updateMany` atômico da sessão com:
   - organização e membership encontradas;
   - `activeStoreId = null`;
   - `contextUpdatedAt = now`;
   - incremento de `contextVersion`;
   - predicado pelo `id` e pela versão lida;
5. se zero linhas forem atualizadas, recomeçar uma vez a partir do estado atual
   ou retornar conflito neutro;
6. retornar DTO seguro.

O cliente nunca fornece `membershipId`.

### 6.2 Selecionar loja

Em transação curta:

1. resolver sessão e contexto organizacional atual;
2. revalidar usuário, organização e membership ativos;
3. buscar `Store` por `(activeOrganizationId, requestedStoreId, ACTIVE)`;
4. buscar `StoreAccess` pelo trio organização, membership e loja, com
   `status=ACTIVE`;
5. atualizar `activeStoreId`, `contextUpdatedAt` e `contextVersion` com
   predicado pela versão;
6. retornar DTO seguro.

O update nunca altera somente um ID sem que todo o conjunto tenha sido
revalidado.

### 6.3 Leitura e limpeza

`getSessionContext` revalida todos os status. Se qualquer elemento estiver
inválido:

- membership/organização inválida: limpa os três IDs;
- loja/acesso inválido: mantém organização/membership válidas e limpa a loja;
- sessão ou usuário inválido: não retorna contexto.

A limpeza é atômica e incrementa `contextVersion`. Desativar entidades não
precisa varrer sessões imediatamente, mas serviços administrativos poderão
chamar uma limpeza em lote no futuro.

## 7. DTOs

DTO organizacional:

```text
organization: { id, tradeName, slug }
membership: { id, status }
store: null | { id, name, code }
contextUpdatedAt
```

Listagens retornam somente organizações de memberships ativas do usuário e
somente lojas com `StoreAccess` ativo. Não retornam:

- `passwordHash`, `tokenHash`, `ipHash`;
- `disabledReason` ou metadados internos;
- memberships de outros usuários;
- organizações sem membership;
- lojas sem acesso;
- `contextVersion`, salvo se futuramente necessário internamente.

## 8. Regras garantidas pelo banco

- slug globalmente único;
- membership única por organização/usuário;
- código de loja único por organização;
- acesso único por membership/loja;
- membership e loja do `StoreAccess` na mesma organização;
- membership referenciada pela sessão pertence ao usuário da sessão;
- organização da sessão coincide com a membership;
- loja da sessão pertence à organização;
- loja ativa possui linha de `StoreAccess` para a membership;
- forma nula do contexto é válida;
- deleções físicas não quebram histórico (`RESTRICT`).

## 9. Regras garantidas pelo serviço

Constraints não expressam estado temporal. O serviço deve revalidar:

- `User.status = ACTIVE`;
- `Organization.status = ACTIVE`;
- `OrganizationMembership.status = ACTIVE`;
- `Store.status = ACTIVE`;
- `StoreAccess.status = ACTIVE`;
- sessão não revogada e dentro das duas expirações;
- normalização de slug e código;
- preenchimento coerente de `disabledAt`/`revokedAt`;
- concorrência pela versão;
- mensagens neutras e não enumeração;
- tenant scope de todas as consultas futuras.

RLS permanece defesa adicional futura e não substitui essas validações.

## 10. Plano de testes

Factories criarão dados fictícios exclusivos e removerão tudo ao final em ordem
de dependência. Não haverá seed.

### Organização

- criar organização;
- rejeitar slug duplicado;
- rejeitar seleção de organização inativa.

### Membership

- aceitar membership ativa;
- rejeitar ausência, suspensão e revogação;
- rejeitar duplicidade organização/usuário;
- rejeitar membership de outro usuário na sessão.

### Loja

- confirmar vínculo com organização;
- rejeitar código duplicado na mesma organização;
- permitir mesmo código em organizações diferentes;
- rejeitar loja inativa.

### Acesso

- aceitar acesso ativo;
- rejeitar ausência, inatividade e revogação;
- rejeitar duplicidade;
- tentar inserção SQL/Prisma direta de membership A com loja B e confirmar erro
  de FK composta.

### Sessão e contexto

- sessão inicial sem contexto;
- seleção válida de organização;
- organização sem membership;
- troca de organização limpa loja;
- seleção válida de loja;
- loja de outra organização;
- loja sem acesso;
- contexto inválido é reduzido ou limpo;
- sessão revogada e usuário inativo;
- corrida entre duas trocas de contexto, com uma atualização rejeitada pela
  versão e nenhum estado parcial;
- DTO sem hashes ou metadados internos;
- cookie/token permanece sem IDs de tenant.

### Regressão e infraestrutura

- testes existentes da Migration 1;
- `prisma format`, `prisma validate`, migration `--create-only`;
- revisão do SQL e aplicação somente após aprovação do desenho;
- `prisma migrate status`;
- inspeção de tabelas, índices, uniques, checks e FKs em `pg_catalog`;
- conexões pooled e direta;
- ausência de resíduos e segredos;
- lint, TypeScript e build.

## 11. SQL esperado em alto nível

A migration deverá:

1. criar quatro enums de status;
2. criar `organizations`;
3. criar `organization_memberships`;
4. criar `stores`;
5. criar `store_accesses`;
6. criar uniques e índices tenant-aware;
7. adicionar cinco colunas nullable/defaultadas à `sessions`;
8. adicionar o `CHECK` de forma do contexto;
9. adicionar FKs simples e compostas com `ON DELETE RESTRICT`;
10. não inserir dados, não criar extensão e não alterar tokens existentes.

Ordem das FKs:

1. memberships para organização e usuário;
2. lojas para organização;
3. acessos para membership e loja por organização;
4. sessão para membership/usuário/organização, loja/organização e acesso.

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| relações compostas sobrepostas rejeitadas pelo Prisma | spike de validação; FKs SQL manuais e teste de drift |
| FK não valida status `ACTIVE` | revalidação central em toda leitura/troca |
| corrida entre trocas | transação + `contextVersion` + update condicional |
| enumeração por IDs | consultas pelo usuário da sessão e mensagens neutras |
| contexto obsoleto após desativação | revalidar toda leitura e limpar atomicamente |
| excesso de índices | manter apenas índices ligados aos fluxos descritos e revisar `EXPLAIN` futuramente |
| crescimento de `StoreAccess` | estratégia explícita é preferível no MVP; revisar somente com evidência de escala |
| drift por `CHECK`/FK manual | migration versionada, introspecção e teste de catálogo |

## 13. Bootstrap futuro

O bootstrap da primeira organização será um caso de uso transacional futuro:

1. usuário autenticado e verificado;
2. criação da organização;
3. criação da membership inicial;
4. criação opcional da primeira loja;
5. criação explícita de `StoreAccess`;
6. seleção do contexto validado.

Papel de proprietário pertence à Migration 3 (RBAC). Nenhum usuário,
organização, loja ou credencial real será criado automaticamente pela
Migration 2.

## 14. Critério de prontidão para implementação

O desenho foi aprovado e implementado com estes pontos:

- redundância de `activeOrganizationId`;
- `contextVersion` para concorrência;
- estratégia A de acesso explícito por loja;
- quatro enums e campos de histórico mínimos;
- FKs compostas de `StoreAccess` e `Session`;
- `CHECK` manual de forma do contexto;
- adiamento de documento fiscal, endereço e RBAC.

O schema foi validado antes da geração. A migration foi criada em
`--create-only`, teve seu SQL revisado e recebeu apenas o `CHECK` manual antes de
ser aplicada pela conexão direta. O contexto persistido continua sendo apenas
um cache revalidado de autorização, nunca autorização permanente.
