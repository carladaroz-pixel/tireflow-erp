# TireFlow ERP — plataforma white-label para borracharias e auto centers

## Decisão de arquitetura

O produto é uma plataforma ERP multiempresa. **TireFlow ERP** é o nome interno provisório; “Sena” poderá ser apenas uma organização cliente, com identidade visual e usuários próprios. O ERP deve evoluir como uma aplicação Next.js/TypeScript independente, com PostgreSQL, Prisma, validação Zod, autenticação por sessão segura e autorização RBAC no servidor.

## White-label e multiempresa

Cada registro operacional terá `organizationId` e, quando aplicável, `storeId`. A organização controla:

- nome empresarial, nome fantasia, documento, endereço e contatos;
- logotipo, favicon, cores primária, secundária e de risco;
- usuários, funções, permissões e limites de aprovação;
- unidades, depósitos, caixas e sequências documentais;
- módulos e funcionalidades contratados;
- domínio personalizado e modelos de impressão.

Nenhum dado de uma organização poderá ser consultado usando apenas um identificador global. Toda consulta e mutação deve receber o escopo da sessão autenticada. Para clientes maiores, a mesma organização poderá possuir várias lojas.

Em produção, ações de estoque devem ocorrer dentro de transações no banco. `InventoryMovement` é somente de acréscimo: não há exclusão ou edição. Uma correção cria outro movimento do tipo `REVERSAL`, apontando para o movimento original.

## Entidades principais

- `Organization`, `OrganizationBrand`, `Subscription`, `FeatureFlag`, `Store`: white-label, módulos contratados e múltiplas lojas.
- `User`, `Employee`, `Role`, `Permission`, `UserRole`: identidade e acesso.
- `Product`, `TireSpecification`, `TireUnit`, `ProductCategory`: catálogo e identificação individual.
- `Warehouse`, `StockLocation`, `StockBalance`: locais e saldos derivados.
- `Supplier`, `StockReceipt`, `StockReceiptItem`: entrada e dupla conferência.
- `InventoryMovement`, `MovementReason`, `InventoryApproval`: razão, vínculo, responsável e aprovação.
- `InventoryCount`, `InventoryCountItem`: inventário físico e divergência.
- `Customer`, `Vehicle`: preparados para a fase comercial.
- `ServiceOrder`, `ServiceOrderItem`: baixa automática futura.
- `Sale`, `SaleItem`: baixa automática futura.
- `AuditLog`, `RiskOccurrence`, `Notification`: trilha completa e alertas.
- `VehicleMileage`, `MaintenancePlan`, `Warranty`, `Tool`, `ToolMovement`: revisões, garantias e ferramentas.
- `Attachment`, `CustomerAcceptance`, `CommissionRule`, `CommissionEntry`: fotos, assinatura e comissões.

## Relações essenciais

```text
Organization 1─N Store 1─N Warehouse 1─N StockLocation
Organization 1─1 OrganizationBrand
Organization 1─1 Subscription 1─N FeatureFlag
Organization 1─N User N─N Role N─N Permission
Product 1─0..1 TireSpecification
Product 1─N TireUnit
Product 1─N InventoryMovement
TireUnit 1─N InventoryMovement
StockReceipt 1─N StockReceiptItem 1─N InventoryMovement
InventoryMovement N─1 User
InventoryMovement 0..1─1 Sale | ServiceOrder | StockReceipt
InventoryMovement 0..1─1 InventoryMovement (estorno do original)
InventoryMovement 1─N RiskOccurrence
AuditLog N─1 User
```

## Regras críticas

1. Movimentações não são apagadas nem reescritas.
2. Toda correção gera estorno vinculado.
3. Toda movimentação registra usuário, perfil, data, hora e motivo.
4. Toda saída exige motivo e, quando aplicável, venda ou OS.
5. Saída sem venda/OS gera ocorrência de risco.
6. Ajuste exige aprovação de gerente ou administrador.
7. O saldo é calculado dentro da mesma transação que cria o movimento.
8. Identificações individuais possuem código único.
9. Logs de auditoria armazenam valores anterior e posterior.
10. Permissões são verificadas no backend; ocultar botões não é segurança.

## Fases

### Fase 1 — demonstrativa

Estrutura visual, login demonstrativo, perfis, dashboard, produtos/pneus, visão de estoque, histórico de entradas/saídas/estornos, alertas e dados fictícios.

### Fase 2 — operacional

Banco exclusivo, autenticação real, APIs transacionais, fornecedores, recebimento com conferência, inventário e aprovação.

### Fase 3 — comercial

Clientes, veículos, vendas, orçamentos, ordens de serviço, baixa automática e pagamentos.

### Fase 4 — gestão

Caixa, financeiro, funcionários, comissões, relatórios, PDF/Excel e notificações.

### Fase 5 — relacionamento e oficina conectada

QR Code e série por pneu, fotos antes/depois, histórico completo do veículo, agenda, revisão por tempo/quilometragem, garantia, ferramentas, peças, acessórios, WhatsApp e assinatura digital da OS.

### Fase 6 — inteligência operacional e antifraude

O diferencial antifraude deve nascer em duas camadas:

1. **Motor de regras explicável:** saída sem vínculo, atividade fora do horário, ajustes recorrentes, sequências incomuns, diferença de inventário, descontos e estornos. Cada alerta informa exatamente a regra acionada.
2. **Detecção estatística/IA:** após acumular dados confiáveis, comparar comportamento por loja, turno, produto e função; pontuar anomalias e sugerir investigação. A IA nunca acusa um funcionário nem bloqueia uma operação sozinha.

Indicadores: score de risco, valor exposto, reincidência, tempo para análise, falso positivo, perdas evitadas e trilha das decisões humanas.

### Futuro

Fiscal, leitor de código, etiquetas, maquininhas, apps para funcionários e clientes, integração com fornecedores e inteligência preditiva de compras.
