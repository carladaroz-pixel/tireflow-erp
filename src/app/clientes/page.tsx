import { createCustomer } from "@/app/actions/mvp";
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
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        whatsapp: true,
        vehicleModel: true,
        licensePlate: true,
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.customer.count({ where }),
  ]);
  return (
    <WorkspaceFrame>
      <h1 className="tireflow-title">Clientes</h1>
      <form action={createCustomer} className="tireflow-card mvp-form">
        {[
          "name",
          "taxId",
          "phone",
          "whatsapp",
          "email",
          "licensePlate",
          "vehicleModel",
          "notes",
        ].map((key) => (
          <input
            name={key}
            key={key}
            required={[
              "name",
              "phone",
              "whatsapp",
              "licensePlate",
              "vehicleModel",
            ].includes(key)}
            placeholder={key}
          />
        ))}
        <button className="tireflow-btn primary">Cadastrar cliente</button>
      </form>
      <div className="tireflow-card tireflow-table-wrap">
        <table className="tireflow-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>WhatsApp</th>
              <th>Veículo</th>
              <th>Placa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.phone}</td>
                <td>{customer.whatsapp}</td>
                <td>{customer.vehicleModel}</td>
                <td>{customer.licensePlate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        pathname="/clientes"
      />
    </WorkspaceFrame>
  );
}
