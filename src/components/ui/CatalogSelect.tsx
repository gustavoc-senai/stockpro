import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../features/auth/AuthContext";
import { useOrganization } from "../../features/organizations/OrganizationContext";
import { supabase } from "../../lib/supabase";
import type { CatalogKind, CatalogRecord } from "../../services/catalog";
import { Feedback } from "../feedback/Feedback";
import { Button } from "./Button";

export function CatalogSelect({
  kind,
  label,
  name,
  value,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
  error,
}: {
  kind: CatalogKind;
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}) {
  const { organizationId } = useOrganization();
  const { user } = useAuth();
  const [localValue, setLocalValue] = useState(defaultValue);
  const selected = value ?? localValue;
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["catalog-reference", user?.id, organizationId, kind, term],
    enabled: !!organizationId && !disabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      let request = supabase
        .from(kind)
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId!)
        .eq("is_active", true)
        .order("name")
        .order("id");
      if (term) {
        const escaped = term
          .slice(0, 120)
          .replace(/[\\%_]/g, (char) => "\\" + char);
        if (kind === "products") {
          const pattern = '"%' + escaped.replaceAll('"', '\\"') + '%"';
          request = request.or(
            "name.ilike." + pattern + ",sku.ilike." + pattern,
          );
        } else request = request.ilike("name", "%" + escaped + "%");
      }
      const { data, count, error } = await request
        .range(pageParam * 20, pageParam * 20 + 19)
        .abortSignal(signal);
      if (error) throw error;
      return { rows: data as CatalogRecord[], count: count ?? 0 };
    },
    getNextPageParam: (last, pages) =>
      pages.length * 20 < last.count ? pages.length : undefined,
  });
  const current = useQuery({
    queryKey: [
      "catalog-reference-current",
      user?.id,
      organizationId,
      kind,
      selected,
    ],
    enabled: !!organizationId && !!selected,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from(kind)
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("id", selected)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as CatalogRecord | null;
    },
  });
  const options = new Map(
    query.data?.pages.flatMap((page) => page.rows).map((row) => [row.id, row]),
  );
  if (current.data) options.set(current.data.id, current.data);
  useEffect(() => {
    selectRef.current?.setCustomValidity(
      selected && !options.has(selected)
        ? "Aguarde a seleção carregar ou escolha um cadastro disponível."
        : "",
    );
  });
  return (
    <div className="catalog-select min-w-0 flex-1">
      <label htmlFor={id}>{label}</label>
      {!disabled && (
        <input
          type="search"
          aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`}
          placeholder={
            kind === "products" ? "Buscar nome ou SKU…" : "Buscar por nome…"
          }
          maxLength={120}
          value={search}
          onChange={(e) => {
            e.stopPropagation();
            setSearch(e.target.value);
          }}
        />
      )}
      <select
        ref={selectRef}
        id={id}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
        name={name}
        value={selected}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">
          {required ? "Selecione uma opção" : "Não informado"}
        </option>
        {Array.from(options.values()).map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
            {row.sku ? ` · ${row.sku}` : ""}
            {row.unit ? ` (${row.unit})` : ""}
            {!row.is_active ? " (inativo)" : ""}
          </option>
        ))}
      </select>
      {error && (
        <span id={id + "-error"} className="field-error" role="alert">
          {error}
        </span>
      )}
      {!!selected &&
        current.isSuccess &&
        !current.data &&
        !options.has(selected) && (
          <p className="field-error">
            O cadastro selecionado não está disponível nesta empresa. Selecione
            novamente.
          </p>
        )}
      <Feedback error={query.error || current.error} />
      {!disabled && (
        <div
          className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400"
          aria-live="polite"
        >
          {query.isFetching
            ? "Buscando…"
            : `${query.data?.pages.reduce((n, p) => n + p.rows.length, 0) ?? 0} de ${query.data?.pages[0]?.count ?? 0} resultados`}
          {query.hasNextPage && (
            <Button
              variant="ghost"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              Carregar mais opções
            </Button>
          )}
          {(query.isError || current.isError) && (
            <Button
              variant="ghost"
              onClick={() => {
                void query.refetch();
                void current.refetch();
              }}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
