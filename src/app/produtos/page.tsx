import { createProduct } from "@/app/actions/mvp";
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
  const where = { organizationId: context.organization.id };
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        type: true,
        brand: true,
        size: true,
        internalCode: true,
        salePrice: true,
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
      <header className="tireflow-page-head">
        <div>
          <p className="tireflow-eyebrow">CATÁLOGO</p>
          <h1 className="tireflow-title">Produtos e Pneus</h1>
        </div>
      </header>
      <form action={createProduct} className="tireflow-card mvp-form">
        <select name="type" required>
          <option value="TIRE">Pneu</option>
          <option value="PRODUCT">Produto</option>
          <option value="SERVICE">Serviço</option>
        </select>
        {[
          "category",
          "name",
          "brand",
          "model",
          "size",
          "rim",
          "internalCode",
          "barcode",
          "purchasePrice",
          "salePrice",
          "minimumStock",
        ].map((key) => (
          <input
            key={key}
            name={key}
            required={["category", "name", "internalCode"].includes(key)}
            type={
              key.includes("Price") ||
              key === "rim" ||
              key === "minimumStock"
                ? "number"
                : "text"
            }
            step={key.includes("Price") ? ".01" : undefined}
            placeholder={key}
          />
        ))}
        <button className="tireflow-btn primary">Novo produto</button>
      </form>
      <div className="tireflow-card tireflow-table-wrap">
        <table className="tireflow-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Tipo</th>
              <th>Marca/medida</th>
              <th>Código</th>
              <th>Saldo</th>
              <th>Venda</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                  <small>{product.category}</small>
                </td>
                <td>{product.type}</td>
                <td>
                  {product.brand} {product.size}
                </td>
                <td>{product.internalCode}</td>
                <td>{product.balances[0]?.quantity ?? 0}</td>
                <td>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(Number(product.salePrice))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        pathname="/produtos"
      />
    </WorkspaceFrame>
  );
}
