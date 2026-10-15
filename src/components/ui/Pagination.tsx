import { Button } from "./Button";
export function Pagination({
  page,
  count,
  pageSize = 20,
  busy = false,
  onChange,
}: {
  page: number;
  count: number;
  pageSize?: number;
  busy?: boolean;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="pagination-count">
        {count === 0
          ? "Nenhum registro"
          : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, count)} de ${count} registros`}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={busy || page === 0}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </Button>
        <span aria-live="polite">
          Página {page + 1} de {pages}
        </span>
        <Button
          variant="secondary"
          disabled={busy || page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </nav>
  );
}
