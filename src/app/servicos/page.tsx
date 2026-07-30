import {
  changeServiceOrderStatus,
  createServiceOrder,
  finishServiceOrder,
} from "@/app/actions/mvp";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ServiceOrderWizard } from "@/components/service-order-wizard";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { ServiceOrderStatus } from "@/generated/prisma/client";
import { getRequiredWorkspaceContext } from "@/lib/auth/web-session";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const labels: Record<ServiceOrderStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada",
};
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default async function Page() {
  const context = await getRequiredWorkspaceContext();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [customers, products, orders] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: context.organization.id, active: true },
      select: {
        id: true,
        name: true,
        phone: true,
        vehicleModel: true,
        licensePlate: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.product.findMany({
      where: {
        organizationId: context.organization.id,
        active: true,
        type: { not: "SERVICE" },
      },
      select: {
        id: true,
        name: true,
        size: true,
        internalCode: true,
        barcode: true,
        salePrice: true,
        codes: { select: { value: true } },
        balances: {
          where: { storeId: context.store.id },
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
    prisma.serviceOrder.findMany({
      where: {
        organizationId: context.organization.id,
        storeId: context.store.id,
      },
      include: {
        customer: true,
        responsible: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const productDtos = products.map((product) => ({
    ...product,
    salePrice: Number(product.salePrice),
    stock: product.balances[0]?.quantity ?? 0,
    codes: product.codes.map((item) => item.value),
  }));
  const canCreate = hasPermission(context.role, "records.create");
  const canUpdate = hasPermission(context.role, "records.update");
  const canFinish = hasPermission(context.role, "inventory.exit.create");
  const todayFinished = orders.filter(
    (order) =>
      order.status === "FINISHED" &&
      order.finishedAt &&
      order.finishedAt >= start,
  );
  const cards = [
    [
      "blue",
      "Ordens abertas",
      orders.filter((order) => order.status === "OPEN").length,
    ],
    [
      "orange",
      "Em andamento",
      orders.filter((order) => order.status === "IN_PROGRESS").length,
    ],
    [
      "yellow",
      "Aguardando",
      orders.filter((order) => order.status === "WAITING").length,
    ],
    ["green", "Finalizadas hoje", todayFinished.length],
    [
      "purple",
      "Valor do dia",
      money.format(
        todayFinished.reduce(
          (total, order) => total + Number(order.totalAmount),
          0,
        ),
      ),
    ],
  ];

  return (
    <WorkspaceFrame>
      <header className="tireflow-page-head">
        <div>
          <p className="tireflow-eyebrow">ATENDIMENTO GUIADO</p>
          <h1 className="tireflow-title">Ordens de Serviço</h1>
          <p className="tireflow-subtitle">
            Siga as quatro etapas. O sistema confere estoque e valores para
            você.
          </p>
        </div>
      </header>
      <section className="os-today">
        {cards.map(([color, label, value]) => (
          <article className={`tireflow-card ${color}`} key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      {canCreate ? (
        <ServiceOrderWizard
          customers={customers}
          products={productDtos}
          responsible={context.user.name}
          action={createServiceOrder}
          canFinalize={canFinish}
        />
      ) : (
        <p className="tireflow-form-message">
          Seu perfil permite consultar ordens, mas não criar novas ordens.
        </p>
      )}
      <section className="os-list">
        <header>
          <div>
            <p className="tireflow-eyebrow">ORDENS RECENTES</p>
            <h2>Acompanhe os serviços</h2>
          </div>
        </header>
        {orders.map((order) => (
          <article
            className={`os-order-card status-${order.status.toLowerCase()}`}
            key={order.id}
          >
            <div className="os-number">
              <small>ORDEM</small>
              <strong>#{order.number}</strong>
              <span className="os-status">{labels[order.status]}</span>
            </div>
            <div className="os-order-main">
              <strong>{order.customer.name}</strong>
              <span>
                {order.vehicleModel} • {order.licensePlate}
              </span>
              <p>{order.description}</p>
              <small>
                Responsável: {order.responsible.name} •{" "}
                {order.openedAt.toLocaleString("pt-BR")}
              </small>
            </div>
            <div className="os-order-value">
              <small>VALOR TOTAL</small>
              <strong>{money.format(Number(order.totalAmount))}</strong>
            </div>
            <div className="os-order-actions">
              {canUpdate && ["OPEN", "WAITING"].includes(order.status) ? (
                <form action={changeServiceOrderStatus}>
                  <input type="hidden" name="id" value={order.id} />
                  <button
                    className="tireflow-btn blue"
                    name="status"
                    value="IN_PROGRESS"
                  >
                    {order.status === "WAITING" ? "Retomar" : "Iniciar"}
                  </button>
                </form>
              ) : null}
              {canUpdate && order.status === "IN_PROGRESS" ? (
                <form action={changeServiceOrderStatus}>
                  <input type="hidden" name="id" value={order.id} />
                  <button
                    className="tireflow-btn orange"
                    name="status"
                    value="WAITING"
                  >
                    Aguardar
                  </button>
                </form>
              ) : null}
              {canFinish &&
              ["OPEN", "IN_PROGRESS", "WAITING"].includes(order.status) ? (
                <form action={finishServiceOrder}>
                  <input type="hidden" name="id" value={order.id} />
                  <ConfirmSubmitButton
                    className="tireflow-btn green"
                    message={`Finalizar a OS #${order.number} e baixar os produtos do estoque?`}
                  >
                    Finalizar e baixar estoque
                  </ConfirmSubmitButton>
                </form>
              ) : null}
              {canUpdate &&
              !["FINISHED", "CANCELLED"].includes(order.status) ? (
                <form action={changeServiceOrderStatus}>
                  <input type="hidden" name="id" value={order.id} />
                  <ConfirmSubmitButton
                    className="tireflow-btn danger"
                    name="status"
                    value="CANCELLED"
                    message={`Cancelar a OS #${order.number}?`}
                  >
                    Cancelar
                  </ConfirmSubmitButton>
                </form>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </WorkspaceFrame>
  );
}
