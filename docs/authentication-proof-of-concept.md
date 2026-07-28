# TireFlow ERP — prova técnica de autenticação e sessões

**Status:** concluída no gate de compatibilidade; instalação interrompida antes de alterar dependências  
**Data da análise:** 28 de julho de 2026  
**Escopo:** credenciais locais fictícias, sessão opaca em PostgreSQL e compatibilidade com a Fundação  
**Fora do escopo:** OAuth, MFA, organizações, lojas, RBAC, recuperação de senha e migration oficial

## 1. Resumo e resultado

A prova encontrou uma incompatibilidade funcional entre o fluxo exigido pelo TireFlow e o Auth.js:

- o TireFlow exige login por credenciais com sessão opaca persistida no servidor;
- o Credentials Provider do Auth.js usa a estratégia JWT e não oferece, como fluxo suportado, criação de database session para esse login;
- adicionar o Prisma Adapter não corrige essa incompatibilidade;
- contornar o callback do Auth.js para criar sessões manualmente dependeria de comportamento interno instável e seria, na prática, uma implementação de sessão própria escondida dentro da biblioteca.

**Resultado:** não instalar Auth.js nem seu adapter para a Migration 1. Recomenda-se uma camada própria, pequena e auditável de credenciais e sessões opacas, usando primitives seguras, Prisma e PostgreSQL. Auth.js poderá ser reavaliado futuramente para OAuth, sem controlar a sessão principal de credenciais.

Nenhum pacote foi instalado, nenhum schema foi criado e nenhum banco foi acessado.

## 2. Ambiente analisado

| Componente | Versão encontrada |
|---|---:|
| Node.js | 24.18.0 |
| npm | 11.16.0 |
| Next.js | 16.2.12 |
| React / React DOM | 19.2.4 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.x |
| ESLint | 9.x |

O projeto usa App Router e `src/app`.

## 3. Fontes oficiais consultadas

- [Auth.js](https://authjs.dev/)
- [Repositório oficial Auth.js](https://github.com/nextauthjs/next-auth)
- [Issue oficial: Credentials não funciona com database strategy](https://github.com/nextauthjs/next-auth/issues/3729)
- [Discussão oficial do Auth.js v5 sobre Credentials e database sessions](https://github.com/nextauthjs/next-auth/discussions/8487)
- [Prisma: Auth.js com Next.js](https://www.prisma.io/docs/guides/authentication/authjs/nextjs)
- [Prisma Schema Reference — UUIDv7](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma: suporte nativo a UUIDv7](https://www.prisma.io/changelog/2024-08-08)
- [Next.js: guia de autenticação](https://nextjs.org/docs/app/guides/authentication)
- [Next.js: API de cookies](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Neon: connection pooling](https://neon.com/docs/connect/connection-pooling)

As páginas oficiais confirmam App Router, leitura server-side da sessão, cookies seguros, UUIDv7 na camada Prisma e conexão direta conservadora para migrations. O repositório/issue mantido pelo Auth.js confirma a limitação central do Credentials Provider.

## 4. Metadados dos pacotes

Consultas feitas com `npm view`, sem instalação:

| Pacote | Versão analisada | Compatibilidade relevante |
|---|---:|---|
| `next-auth` estável | 4.24.15 | peer aceita Next 16/React 19; Credentials + database session não suportado |
| `next-auth@beta` | 5.0.0-beta.32 | peers aceitam Next 14–16 e React 18–19; ainda beta |
| `@auth/prisma-adapter` | 2.11.3 | peer declara `@prisma/client` somente até v6 |
| `prisma` | 6.19.1 | Node >=18.18 |
| `@prisma/client` | 6.19.1 | TypeScript >=5.1 |
| `@prisma/adapter-pg` | 6.19.1 | usa `pg` 8.x |
| `prisma` atual | 7.9.1 | Node compatível; não aceito pelo peer atual do Auth adapter |
| `argon2` | 0.45.1 | Node >=16.17 |
| `pg` | 8.22.0 | Node >=16 |
| `zod` | 4.4.3 | validação de entradas |

### Combinação que seria necessária para testar o adapter

```text
next-auth@5.0.0-beta.32
@auth/prisma-adapter@2.11.3
prisma@6.19.1
@prisma/client@6.19.1
@prisma/adapter-pg@6.19.1
pg@8.x
argon2@0.45.1
zod@4.x
```

Essa combinação não possui conflito principal de peer com o Next atual, desde que Prisma fique em v6. Mesmo assim, falha no requisito funcional de Credentials + database session. Portanto, a instalação não se justifica.

### Atualizações principais que foram evitadas

- Prisma 7 não seria aceito pelo peer atual do `@auth/prisma-adapter`.
- Auth.js v5 permanece beta.
- Nenhum downgrade do Next.js ou React seria aceitável.
- Nenhum override de peer dependency seria aceitável para uma fundação de segurança.

## 5. Arquitetura mínima recomendada

```text
POST /auth/login
  -> validar schema e Origin/CSRF
  -> normalizar email
  -> buscar User + UserCredential
  -> verificar Argon2id ou dummy hash
  -> validar User.status
  -> gerar token aleatório opaco
  -> persistir hash do token em Session
  -> definir cookie __Host-tireflow_session

request autenticada
  -> ler cookie opaco
  -> calcular hash do token
  -> buscar Session + User
  -> validar expiração, revogação e status
  -> atualizar lastSeenAt com limitação de frequência
  -> retornar ServerSession mínima

POST /auth/logout
  -> revogar Session
  -> expirar cookie
```

O cookie não contém JWT, usuário, organização, loja, função ou permissão.

## 6. Modelo mínimo — especificação, não schema oficial

### User

| Campo | Regra |
|---|---|
| `id` | UUIDv7 gerado na aplicação/Prisma; PostgreSQL `uuid` |
| `email` | valor de exibição |
| `emailNormalized` | lowercase/normalização definida; unique |
| `name` | obrigatório |
| `status` | `ACTIVE`, `INACTIVE`, `BLOCKED` |
| `emailVerifiedAt` | nullable; sem fluxo real nesta POC |
| `createdAt`, `updatedAt` | UTC |

`User` é global e não possui `organizationId` ou `storeId`.

### UserCredential

| Campo | Regra |
|---|---|
| `userId` | PK/FK para User |
| `passwordHash` | PHC string Argon2id |
| `hashVersion` | permite evolução de parâmetros |
| `passwordChangedAt` | UTC |
| `failedAttemptCount` | apoio inicial; rate limit externo futuro |
| `lockedUntil` | bloqueio temporário |
| `createdAt`, `updatedAt` | UTC |

Credencial fica separada de `User` para reduzir exposição acidental.

### Session

| Campo | Regra |
|---|---|
| `id` | UUIDv7 |
| `userId` | FK para User |
| `tokenHash` | SHA-256 ou HMAC-SHA-256 do token; unique |
| `expiresAt` | expiração absoluta em UTC |
| `idleExpiresAt` | expiração por inatividade |
| `lastSeenAt` | atualização limitada |
| `revokedAt` | nullable |
| `revokeReason` | enum/texto controlado |
| `createdAt` | UTC |
| `ipAddressHash` | opcional e pseudonimizado |
| `userAgent` | opcional, truncado |

Migration 1 não inclui contexto de organização ou loja. A Migration 2 adicionará o contexto ativo conforme o desenho aprovado.

### SessionEvent opcional

Para preservar histórico sem transformar `Session` em auditoria definitiva: `CREATED`, `REVOKED`, `EXPIRED`, `LOGOUT`, `REVOKE_ALL`. Pode ser adiado para a Migration 7; até lá, logs estruturados sem segredos cobrem a POC.

## 7. Token e cookie

### Token

- gerar com CSPRNG, no mínimo 256 bits;
- codificar em base64url;
- enviar somente uma vez ao cookie;
- persistir apenas hash/HMAC;
- comparar hashes em tempo constante;
- rotacionar após login e alterações críticas;
- não reutilizar após revogação.

### Cookie proposto

| Opção | Valor |
|---|---|
| nome | `__Host-tireflow_session` em produção |
| conteúdo | token opaco aleatório |
| `httpOnly` | `true` |
| `secure` | `true` em produção |
| `sameSite` | `lax` |
| `path` | `/` |
| `domain` | não definir, requisito do prefixo `__Host-` |
| expiração | alinhada a `expiresAt` |

Em desenvolvimento HTTP, usar nome sem `__Host-` e `secure=false`, condicionado a `NODE_ENV`.

### CSRF

- aceitar mutações somente via POST/Server Actions;
- validar `Origin`/`Host`;
- `sameSite=lax` como barreira adicional;
- token CSRF vinculado à sessão em formulários convencionais quando Origin não for suficiente;
- nunca tratar CORS como proteção de autenticação.

## 8. Fluxo de login

1. Receber somente `email` e `password` validados por schema.
2. Normalizar e-mail.
3. Aplicar rate limit por IP e identidade normalizada.
4. Buscar usuário e credencial.
5. Se não existir, verificar um dummy hash Argon2id para reduzir diferença temporal.
6. Verificar hash real quando existir.
7. Responder com erro genérico para inexistente, senha incorreta, inativo ou bloqueado.
8. Criar token e sessão dentro de transação.
9. Definir cookie após a transação confirmar.
10. Nunca registrar senha, hash completo ou token.

## 9. Leitura da sessão

1. Ler cookie no servidor.
2. Rejeitar ausência/formato inválido.
3. Calcular hash.
4. Buscar sessão por `tokenHash`.
5. Validar `revokedAt`, `expiresAt`, `idleExpiresAt` e `User.status`.
6. Retornar somente `userId`, `sessionId` e dados mínimos de apresentação.
7. Não aceitar `organizationId` do body/header como parte da identidade.

## 10. Logout e revogação

### Logout da sessão atual

- update condicional `revokedAt IS NULL`;
- motivo `LOGOUT`;
- expirar cookie mesmo se sessão já estiver ausente;
- operação idempotente.

### Revogar todas as sessões

- transação atualiza todas as sessões ativas do usuário;
- motivo `SECURITY_CHANGE`, `PASSWORD_CHANGE`, `ADMIN_ACTION` ou `USER_REQUEST`;
- cookie atual expira;
- sessões revogadas nunca são reativadas.

### Expiração

- checagem obrigatória em toda leitura;
- limpeza física por job posterior à retenção;
- expiração lógica funciona mesmo sem job.

## 11. Hash de senha

### Escolha

Argon2id pela biblioteca `argon2`, atualmente 0.45.1.

Parâmetros iniciais propostos, sujeitos a benchmark no ambiente de produção:

```text
memoryCost: 19456 KiB
timeCost: 2
parallelism: 1
hashLength: 32 bytes
```

Regras:

- salt aleatório gerado pela biblioteca;
- PHC string persistida;
- `argon2.verify` para comparação segura;
- rehash no próximo login quando `hashVersion` ou parâmetros ficarem antigos;
- tamanho máximo da senha na entrada para evitar abuso de CPU/memória;
- nenhuma senha em logs, erros, analytics ou auditoria;
- dummy hash para usuário inexistente;
- rate limiting futuro em storage compartilhado;
- bloqueio progressivo sem permitir DoS permanente de conta.

Não haverá usuário ou senha real na POC. Credenciais futuras de seed usarão domínio `.example` e ambiente local/teste.

## 12. Comparação das opções

| Critério | A — Adapter padrão | B — Auth.js adaptado | C — Sessão própria restrita |
|---|---|---|---|
| Next.js 16/App Router | compatível por peer | compatível por peer | APIs nativas do Next |
| Credentials | suporta authorize | suporta authorize | implementado explicitamente |
| Sessão opaca em banco com Credentials | **não suportada** | **não resolvida pelo adapter** | atendida |
| Revogação | boa para DB sessions de providers suportados | exige contorno para Credentials | explícita e imediata |
| Schema TireFlow | força shapes do adapter | permite maps/extensões, mas mantém contrato | liberdade total |
| Usuário multiempresa | extensível | extensível | separado naturalmente |
| Migrations pequenas | tabelas extras (`Account`, tokens) | possível, com acoplamento | somente tabelas necessárias |
| Dependência da biblioteca | alta | alta e baseada em beta | baixa; primitives estáveis |
| Manutenção | menor em OAuth | média/alta | maior responsabilidade própria |
| Segurança | defaults maduros | risco de custom callbacks | exige revisão/testes rigorosos |
| Testabilidade | boa no fluxo suportado | complexa | serviços pequenos e determinísticos |
| Prisma 7 | adapter atual não declara suporte | mesmo limite | independente do Auth adapter |

### Opção A — tabelas padrão

Boa para OAuth e magic links, mas cria `Account` e `VerificationToken` sem necessidade imediata e não atende Credentials + database session. Rejeitada.

### Opção B — modelos adaptados

`@map`/`@@map` e campos adicionais preservam convenções físicas, porém o adapter continua sem criar database session para Credentials. Um workaround manual ficaria dependente de callbacks/internals da beta. Rejeitada para a sessão principal.

### Opção C — camada própria

Atende exatamente credenciais, hash, sessão opaca, revogação e modelagem multiempresa futura. O custo é responsabilidade de segurança. Será aceitável somente com escopo pequeno, revisão, testes de integração e proibição de inventar criptografia.

## 13. Testes

### Executáveis sem banco

Após autorização para instalar dependências:

- validação de e-mail/senha;
- geração e formato do token opaco;
- hash determinístico do token;
- Argon2id: senha válida/inválida e `needsRehash`;
- redaction de objetos;
- serialização do cookie sem tenant;
- cálculo de expiração;
- rejeição de `organizationId` em DTO;
- mensagens de erro neutras.

### Dependentes do Neon

- usuário válido;
- senha inválida;
- inexistente com dummy hash;
- inativo/bloqueado;
- sessão criada e recuperada;
- expirada;
- revogada;
- logout idempotente;
- revogar todas;
- múltiplas sessões;
- reutilização de token revogado;
- concorrência de revogação;
- rollback quando criação da sessão falha.

### Pendentes

Todos os testes permanecem pendentes nesta etapa porque não há banco Neon nem dependências autorizadas/instaladas. A POC foi encerrada no gate de compatibilidade, antes de produzir código experimental que não representaria a solução escolhida.

## 14. Isolamento do protótipo

Não foram criadas rotas, handlers, componentes ou imports. O login demonstrativo continua intocado. A futura POC da sessão própria deverá ficar em:

```text
src/experimental/auth-proof/
tests/integration/auth-proof/
```

Nenhum arquivo experimental será importado por `src/app` nem exposto no build de produção.

## 15. Variáveis necessárias

O arquivo rastreável `.env.example` contém somente placeholders:

```env
DATABASE_URL="POOLED_CONNECTION_STRING"
DIRECT_DATABASE_URL="DIRECT_CONNECTION_STRING"
AUTH_SECRET="GENERATED_SECRET"
```

São necessários:

1. URI pooled do projeto Neon exclusivo do TireFlow;
2. URI direta do mesmo projeto/branch para migrations;
3. segredo aleatório de alta entropia gerado localmente.

Valores reais ficarão em `.env.local` ou mecanismo de secrets e nunca serão impressos ou versionados.

## 16. Impacto previsto na Migration 1

### User

- permanece global;
- não contém senha;
- não contém organização/loja;
- ganha relação 1:1 com `UserCredential`;
- status controla login e revogação.

### Session

- schema próprio, não o modelo obrigatório do adapter;
- token hasheado, múltiplas sessões e revogação;
- nenhum contexto tenant na Migration 1;
- contexto ativo só entra na Migration 2;
- índice unique em `tokenHash` e índices de expiração/usuário.

### Tabelas que não serão criadas agora

- `Account`: OAuth fora do escopo.
- modelo padrão `VerificationToken`: será substituído por tokens específicos quando esses fluxos forem implementados.
- tabelas de organização, loja ou RBAC.

## 17. Riscos

| Risco | Mitigação |
|---|---|
| implementação própria incompleta | escopo pequeno, threat model, revisão e testes |
| token vazado | hash no banco, cookie seguro, rotação e revogação |
| timing leak | dummy hash e mensagem neutra |
| brute force | rate limit, backoff e bloqueio controlado |
| session fixation | novo token após login e mudanças críticas |
| CSRF | sameSite, Origin e token quando aplicável |
| sessão antiga após suspensão | validar User.status em toda leitura |
| custo Argon2 abusado | limite de entrada e rate limit |
| acoplamento ao Next | serviços de domínio independentes da rota |
| futura adoção OAuth | integrar provider sem substituir sessão principal sem nova ADR |

## 18. Itens pendentes

- criar projeto Neon exclusivo;
- fornecer URLs pooled e direta localmente;
- gerar `AUTH_SECRET` fora do repositório;
- decidir Prisma 6 versus 7 para a implementação própria, agora sem restrição do Auth adapter;
- benchmark dos parâmetros Argon2id;
- definir duração absoluta e de inatividade;
- definir estratégia de rate limit compartilhado;
- threat model e revisão de segurança;
- autorização explícita para instalar dependências e criar a POC da opção C.

## 19. Decisão

**Não prosseguir com Auth.js para login por credenciais e sessão opaca persistida.**

Prosseguir, em uma etapa autorizada posterior, com a **Opção C: camada própria restrita de sessão e credenciais**, usando:

- APIs server-side do Next.js;
- Prisma/PostgreSQL;
- token aleatório opaco;
- hash do token no banco;
- Argon2id;
- validação de schema;
- cookies seguros;
- serviços testáveis e isolados.

Auth.js pode ser reavaliado apenas se OAuth entrar no roadmap e após definir como coexistirá com a sessão principal.

