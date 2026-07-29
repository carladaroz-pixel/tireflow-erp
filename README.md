# TireFlow ERP

ERP piloto para borracharias e auto centers, com autenticação própria, contexto
multiempresa/multiloja e RBAC server-side.

## Ambiente local

Copie os placeholders de `.env.example` para o arquivo local ignorado
`.env.local` e preencha as conexões, `AUTH_SECRET` e variáveis `BOOTSTRAP_*`.
Nunca versione a senha piloto.

Crie ou repare os registros piloto de forma explícita e idempotente:

```bash
npm run bootstrap:pilot
```

O comando cria ou localiza usuário, credencial, organização, loja, membership
`OWNER` e `StoreAccess`. Ele não roda em build, migration ou produção. Para
recriar deliberadamente a credencial, defina localmente
`BOOTSTRAP_RESET_PASSWORD="true"`, execute uma vez e volte para `false`.

Inicie:

```bash
npm run dev
```

Acesse `http://localhost:3000/entrar` e use o e-mail/senha definidos localmente.
Após entrar, o sistema seleciona automaticamente organização e loja quando há
uma única opção. Use **Trocar contexto** para escolher outra opção e **Sair**
para revogar a sessão.

## Segurança web

- cookie `tireflow_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`;
- `Secure` em produção e expiração alinhada à sessão;
- token nunca entra em localStorage, sessionStorage, URL ou resposta da action;
- login, logout e seleção usam Server Actions;
- páginas protegidas revalidam sessão, tenant, loja e RBAC no servidor.

## Validação

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
