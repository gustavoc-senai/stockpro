import { CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router-dom";
export function SetupChecklist({
  products,
  branches,
  warehouses,
  owner,
}: {
  products: number;
  branches: number;
  warehouses: number;
  owner: boolean;
}) {
  const items = [
    { label: "Cadastrar uma filial", path: "branches", complete: branches > 0 },
    {
      label: "Preparar um depósito",
      path: "warehouses",
      complete: warehouses > 0,
    },
    {
      label: "Adicionar produtos ao catálogo",
      path: owner ? "imports" : "products",
      complete: products > 0,
    },
  ];
  const complete = items.filter((item) => item.complete).length;
  if (complete === items.length) return null;
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Prepare sua empresa para começar</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Organize os locais e o catálogo antes de registrar o estoque.
          </p>
        </div>
        <span className="status-badge">
          {complete} de {items.length} etapas
        </span>
      </div>
      <progress
        className="setup-progress my-5 w-full"
        max={items.length}
        value={complete}
        aria-label="Progresso da configuração"
      />
      <ol className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <li key={item.path}>
            <Link className="setup-step" to={"/app/" + item.path}>
              {item.complete ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : (
                <Circle size={20} className="text-blue-400" />
              )}
              <span>{item.label}</span>
              {item.complete && <span className="sr-only">Concluído</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
