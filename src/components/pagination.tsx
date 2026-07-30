import Link from "next/link";

export function Pagination({
  page,
  pageSize,
  total,
  pathname,
}: {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav className="tireflow-pagination" aria-label="Paginação">
      <Link
        className={`tireflow-btn ${page <= 1 ? "is-disabled" : ""}`}
        href={`${pathname}?pagina=${Math.max(1, page - 1)}`}
        aria-disabled={page <= 1}
      >
        Anterior
      </Link>
      <strong>
        Página {page} de {totalPages}
      </strong>
      <Link
        className={`tireflow-btn ${page >= totalPages ? "is-disabled" : ""}`}
        href={`${pathname}?pagina=${Math.min(totalPages, page + 1)}`}
        aria-disabled={page >= totalPages}
      >
        Próxima
      </Link>
    </nav>
  );
}
