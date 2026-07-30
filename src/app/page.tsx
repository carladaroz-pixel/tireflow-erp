import { WorkspaceFrame } from "@/components/workspace-frame";
import {
  ProductType,
  ServiceOrderStatus,
  StockMovementType,
} from "@/generated/prisma/client";
import { getRequiredWorkspaceContext } from "@/lib/auth/web-session";
import { prisma } from "@/lib/db/prisma";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function Page() {
  const context = await getRequiredWorkspaceContext();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const scope = {
    organizationId: context.organization.id,
    storeId: context.store.id,
  };
  const [
    products,
    balances,
    entries,
    exits,
    customers,
    openOrders,
    finished,
    latest,
    recent,
  ] = await Promise.all([
    prisma.product.count({
      where: { organizationId: context.organization.id, active: true },
    }),
    prisma.stockBalance.findMany({
      where: scope,
      select: {
        quantity: true,
        product: {
          select: {
            id: true,
            name: true,
            type: true,
            minimumStock: true,
          },
        },
      },
    }),
    prisma.stockMovement.count({
      where: {
        ...scope,
        type: StockMovementType.ENTRY,
        occurredAt: { gte: start },
      },
    }),
    prisma.stockMovement.count({
      where: {
        ...scope,
        type: StockMovementType.EXIT,
        occurredAt: { gte: start },
      },
    }),
    prisma.customer.count({
      where: { organizationId: context.organization.id, active: true },
    }),
    prisma.serviceOrder.count({
      where: {
        ...scope,
        status: {
          in: [
            ServiceOrderStatus.OPEN,
            ServiceOrderStatus.IN_PROGRESS,
            ServiceOrderStatus.WAITING,
          ],
        },
      },
    }),
    prisma.serviceOrder.aggregate({
      where: {
        ...scope,
        status: ServiceOrderStatus.FINISHED,
        finishedAt: { gte: start },
      },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.stockMovement.findMany({
      where: scope,
      select: {
        id: true,
        type: true,
        quantity: true,
        product: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
    prisma.serviceOrder.findMany({
      where: scope,
      select: {
        id: true,
        number: true,
        description: true,
        status: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const tireStock = balances
    .filter((balance) => balance.product.type === ProductType.TIRE)
    .reduce((total, balance) => total + balance.quantity, 0);
  const alerts = balances.filter(
    (balance) => balance.quantity <= balance.product.minimumStock,
  );
  const cards = [
    ["Produtos cadastrados", products],
    ["Pneus em estoque", tireStock],
    ["Entradas hoje", entries],
    ["Saídas hoje", exits],
    ["Alertas de estoque", alerts.length],
    ["Clientes cadastrados", customers],
    ["Ordens abertas", openOrders],
    ["Serviços finalizados hoje", finished._count],
    [
      "Valor finalizado hoje",
      money.format(Number(finished._sum.totalAmount ?? 0)),
    ],
  ];
  return (
    <WorkspaceFrame>
      <header className="tireflow-page-head">
        <div>
          <p className="tireflow-eyebrow">
            VISÃO GERAL • {context.store.code}
          </p>
          <h1 className="tireflow-title">
            Olá, {context.user.name.split(" ")[0]}.
          </h1>
          <p className="tireflow-subtitle">
            {context.organization.tradeName} — operação em tempo real.
          </p>
        </div>
      </header>
      <section className="tireflow-grid tireflow-kpis tireflow-kpis-six">
        {cards.map(([label, value]) => (
          <article className="tireflow-card tireflow-kpi" key={label}>
            <strong>{value}</strong>
            <p>{label}</p>
          </article>
        ))}
      </section>
      <div className="mvp-two">
        <section className="tireflow-card tireflow-stat-list">
          <h2>Últimas movimentações</h2>
          {latest.map((movement) => (
            <div className="tireflow-stat-row" key={movement.id}>
              <span>
                {movement.product.name} • {movement.user.name}
              </span>
              <strong>
                {movement.type} {movement.quantity}
              </strong>
            </div>
          ))}
        </section>
        <section className="tireflow-card tireflow-stat-list">
          <h2>Estoque baixo</h2>
          {alerts.slice(0, 20).map((balance) => (
            <div className="tireflow-stat-row" key={balance.product.id}>
              <span>{balance.product.name}</span>
              <strong>{balance.quantity}</strong>
            </div>
          ))}
        </section>
      </div>
      <section className="tireflow-card tireflow-stat-list">
        <h2>Ordens recentes</h2>
        {recent.map((order) => (
          <div className="tireflow-stat-row" key={order.id}>
            <span>
              #{order.number} • {order.customer.name} • {order.description}
            </span>
            <strong>{order.status}</strong>
          </div>
        ))}
      </section>
    </WorkspaceFrame>
  );
}
