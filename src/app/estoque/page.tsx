import { Pagination } from "@/components/pagination";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { getRequiredWorkspaceContext } from "@/lib/auth/web-session";
import { prisma } from "@/lib/db/prisma";

const PAGE_SIZE = 20;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const context = await getRequiredWorkspaceContext();
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.pagina ?? "1", 10) || 1);
  const where = {
    organizationId: context.organization.id,
    active: true,
    type: { not: "SERVICE" as const },
  };
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        internalCode: true,
        brand: true,
        size: true,
        minimumStock: true,
        balances: {
          where: { storeId: context.store.id },
          select: { quantity: true },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  return (
    <WorkspaceFrame>
      <h1 className="tireflow-title">Estoque — {context.store.name}</h1>
      <div className="tireflow-card tireflow-table-wrap">
        <table className="tireflow-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Código</th>
              <th>Marca</th>
              <th>Medida</th>
              <th>Saldo</th>
              <th>Mínimo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const quantity = product.balances[0]?.quantity ?? 0;
              return (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.internalCode}</td>
                  <td>{product.brand}</td>
                  <td>{product.size}</td>
                  <td>
                    <strong>{quantity}</strong>
                  </td>
                  <td>{product.minimumStock}</td>
                  <td>
                    <span
                      className={`tireflow-badge ${
                        quantity === 0
                          ? "red"
                          : quantity <= product.minimumStock
                            ? "orange"
                            : ""
                      }`}
                    >
                      {quantity === 0
                        ? "Sem estoque"
                        : quantity <= product.minimumStock
                          ? "Estoque baixo"
                          : "Normal"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        pathname="/estoque"
      />
    </WorkspaceFrame>
  );
}
