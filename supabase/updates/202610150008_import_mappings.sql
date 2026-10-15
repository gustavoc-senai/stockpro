-- Execute after foundation/team (005). Import preview/commit still requires 007.
begin;
create function public.stockpro_valid_import_mapping(p_kind text, p_headers jsonb, p_mapping jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_key text; v_value jsonb; v_allowed text[];
begin
  if p_headers is null or p_mapping is null or jsonb_typeof(p_headers) <> 'array' or jsonb_typeof(p_mapping) <> 'object' then return false; end if;
  if jsonb_array_length(p_headers) not between 1 and 50 or octet_length(p_headers::text) > 16000 then return false; end if;
  if exists(select 1 from jsonb_array_elements(p_headers) h where jsonb_typeof(h) <> 'string' or length(h #>> '{}') not between 1 and 300) then return false; end if;
  v_allowed := case p_kind
    when 'products' then array['name','sku','unit','category','brand','supplier','minimum_stock']
    when 'categories' then array['name','description']
    when 'brands' then array['name','description']
    when 'suppliers' then array['name','email','phone','document']
    when 'customers' then array['name','email','phone','document'] else null end;
  if v_allowed is null then return false; end if;
  for v_key, v_value in select * from jsonb_each(p_mapping) loop
    if not(v_key = any(v_allowed)) or jsonb_typeof(v_value) <> 'number' then return false; end if;
    if (v_value::text)::numeric <> trunc((v_value::text)::numeric) or (v_value::text)::numeric < -1 or (v_value::text)::numeric >= jsonb_array_length(p_headers) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.stockpro_valid_import_mapping(text,jsonb,jsonb) from public,anon;
grant execute on function public.stockpro_valid_import_mapping(text,jsonb,jsonb) to authenticated;
create table public.catalog_import_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  name text not null check (length(btrim(name)) between 2 and 80),
  headers jsonb not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  check (public.stockpro_valid_import_mapping(kind,headers,mapping))
);
create unique index catalog_import_mapping_name on public.catalog_import_mappings(organization_id,kind,lower(btrim(name)));
alter table public.catalog_import_mappings enable row level security;
revoke all on public.catalog_import_mappings from public,anon,authenticated;
grant select,insert,delete on public.catalog_import_mappings to authenticated;
create policy owner_read_import_mapping on public.catalog_import_mappings for select to authenticated using(public.stockpro_owner(organization_id));
create policy owner_create_import_mapping on public.catalog_import_mappings for insert to authenticated with check(public.stockpro_owner(organization_id));
create policy owner_delete_import_mapping on public.catalog_import_mappings for delete to authenticated using(public.stockpro_owner(organization_id));
commit;
