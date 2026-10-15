-- STOCKPRO: empresa de demonstração. Execute inteiro no SQL Editor.
-- 1. Crie/confirme uma conta pelo cadastro do sistema ou pelo Supabase Auth.
-- 2. Troque SOMENTE o e-mail abaixo pelo e-mail dessa conta.
-- Não cria senha, não altera auth.users e não modifica empresas existentes.
-- Requer a fundação e os módulos de estoque/inventário/equipe (001 a 005).
begin;
do $demo$
declare
  v_email text := 'samuel.rodrigues212515@gmail.com'; -- Conta proprietária da demonstração
  v_user uuid;
  v_org uuid;
  v_namespace text;
  v_marker uuid;
  v_branch_main uuid;
  v_branch_other uuid;
  v_warehouse_main uuid;
  v_warehouse_reserve uuid;
  v_warehouse_other uuid;
  v_product uuid;
  v_quantity numeric;
  v_transfer numeric;
  v_out numeric;
  v_counted numeric;
  i integer;
  v_categories text[] := array['Ferramentas manuais','Ferramentas elétricas','Fixação','Elétrica','Hidráulica','Pintura','Equipamentos de proteção','Organização'];
  v_brands text[] := array['Atlas Demo','Forte Demo','Precisão Demo','Nova Linha Demo','ProWork Demo','Casa Técnica Demo'];
  v_suppliers text[] := array['Distribuidora Horizonte Demo','Ferragens Central Demo','Elétrica Brasil Demo','Hidráulica União Demo','Tintas Aurora Demo','Proteção Total Demo'];
  v_customers text[] := array['Construtora Horizonte Demo','Oficina Nova Era Demo','Condomínio Jardim Demo','Marcenaria Carvalho Demo','Instaladora Alpha Demo','Manutenção Prime Demo','Reformas Ideal Demo','Loja Bairro Demo','Serviços União Demo','Engenharia Aurora Demo'];
  v_products text[] := array[
    'Martelo de unha 25 mm','Furadeira de impacto 650 W','Parafuso cabeça chata 4 mm','Tomada dupla 20 A','Joelho PVC 25 mm','Rolo de pintura 23 cm','Luva de proteção tamanho M','Caixa organizadora 12 L',
    'Chave de fenda 6 mm','Parafusadeira a bateria','Bucha de nylon 8 mm','Interruptor simples','Tubo PVC 25 mm','Pincel de pintura 2 polegadas','Óculos de proteção','Maleta para ferramentas',
    'Alicate universal 8 polegadas','Serra tico-tico 400 W','Porca sextavada 8 mm','Cabo flexível 2,5 mm','Registro de esfera 25 mm','Bandeja para pintura','Protetor auricular','Estante de aço 5 prateleiras',
    'Trena de aço 5 m','Lixadeira orbital 200 W','Arruela lisa 8 mm','Disjuntor monopolar 20 A','Fita veda rosca 18 mm','Espátula de aço 10 cm','Capacete de segurança','Gaveteiro organizador',
    'Chave ajustável 10 polegadas','Esmerilhadeira 750 W','Abraçadeira de nylon 200 mm','Extensão elétrica 5 m'
  ];
begin
  if v_email = 'SEU_EMAIL_AQUI' or position('@' in v_email) = 0 then
    raise exception 'Troque SEU_EMAIL_AQUI pelo e-mail de uma conta já criada e confirmada no Supabase Auth.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(v_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Conta não encontrada ou e-mail não confirmado. Cadastre/confirme a conta antes de executar.'; end if;
  if to_regclass('public.products') is null or to_regclass('public.stock_counts') is null or to_regclass('public.audit_events') is null then
    raise exception 'Aplique primeiro a fundação e os módulos 001 a 005. Nenhum dado foi gravado.';
  end if;
  v_namespace := 'stockpro:demo:v1:' || v_user::text;
  v_marker := md5(v_namespace || ':completed')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_namespace, 19));
  if exists(select 1 from public.audit_events where id = v_marker and actor_id = v_user and action = 'demo_seed_completed') then
    raise notice 'A demonstração desta conta já foi criada. Nada foi alterado.';
    return;
  end if;
  -- As RPCs verificam auth.uid() e registram esse usuário como autor.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);

  if not exists(select 1 from public.profiles where id = v_user) then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='full_name') then
      insert into public.profiles(id,full_name) values(v_user,'Proprietário da demonstração');
    else
      insert into public.profiles(id) values(v_user);
    end if;
  end if;

  v_org := public.stockpro_onboard('Horizonte Materiais · Demonstração','Matriz São Paulo','Depósito principal',md5(v_namespace || ':onboard')::uuid);
  if not public.stockpro_owner(v_org) then raise exception 'A conta não foi vinculada como proprietária. Operação cancelada.'; end if;
  select id into strict v_branch_main from public.branches where organization_id=v_org and name='Matriz São Paulo';
  select id into strict v_warehouse_main from public.warehouses where organization_id=v_org and branch_id=v_branch_main and name='Depósito principal';
  v_branch_other := md5(v_namespace || ':branch:2')::uuid;
  v_warehouse_reserve := md5(v_namespace || ':warehouse:2')::uuid;
  v_warehouse_other := md5(v_namespace || ':warehouse:3')::uuid;
  insert into public.branches(id,organization_id,name,is_active) values(v_branch_other,v_org,'Filial Campinas',true);
  insert into public.warehouses(id,organization_id,branch_id,name,is_active) values
    (v_warehouse_reserve,v_org,v_branch_main,'Reserva e reposição',true),
    (v_warehouse_other,v_org,v_branch_other,'Depósito Campinas',true);

  for i in 1..array_length(v_categories,1) loop
    insert into public.categories(id,organization_id,name,description,is_active)
    values(md5(v_namespace || ':category:' || i)::uuid,v_org,v_categories[i],'Categoria de demonstração para testes e apresentação.',true);
  end loop;
  for i in 1..array_length(v_brands,1) loop
    insert into public.brands(id,organization_id,name,description,is_active)
    values(md5(v_namespace || ':brand:' || i)::uuid,v_org,v_brands[i],'Marca fictícia da empresa de demonstração.',true);
  end loop;
  for i in 1..array_length(v_suppliers,1) loop
    insert into public.suppliers(id,organization_id,name,email,phone,document,is_active)
    values(md5(v_namespace || ':supplier:' || i)::uuid,v_org,v_suppliers[i],'fornecedor' || i || '@stockpro.example.test','(11) 0000-' || lpad(i::text,4,'0'),'',true);
  end loop;
  for i in 1..array_length(v_customers,1) loop
    insert into public.customers(id,organization_id,name,email,phone,document,is_active)
    values(md5(v_namespace || ':customer:' || i)::uuid,v_org,v_customers[i],'cliente' || i || '@stockpro.example.test','(19) 0000-' || lpad(i::text,4,'0'),'',true);
  end loop;

  for i in 1..array_length(v_products,1) loop
    v_product := md5(v_namespace || ':product:' || i)::uuid;
    insert into public.products(id,organization_id,name,sku,unit,minimum_stock,category_id,brand_id,supplier_id,is_active)
    values(v_product,v_org,v_products[i],'DEMO-' || lpad(i::text,4,'0'),case when i=20 then 'M' else 'UN' end,
      case when i%6=0 then 200 else 10 end,
      md5(v_namespace || ':category:' || (((i-1)%8)+1))::uuid,
      md5(v_namespace || ':brand:' || (((i-1)%6)+1))::uuid,
      md5(v_namespace || ':supplier:' || (((i-1)%6)+1))::uuid,true);

    v_quantity := case when i%6=0 then 8 else 40+i*3 end;
    v_transfer := case when i%3=0 then greatest(1,trunc(v_quantity/4)) else 0 end;
    v_out := case when i<=24 then greatest(1,trunc(v_quantity/5)) else 0 end;
    -- Nunca insira diretamente em saldos ou histórico: as RPCs mantêm a consistência.
    perform public.stockpro_move(v_org,v_product,v_warehouse_main,null,'in',v_quantity,'DEMO: recebimento inicial',md5(v_namespace || ':in:main:' || i)::uuid);
    if i%2=0 then
      perform public.stockpro_move(v_org,v_product,v_warehouse_other,null,'in',(10+i)::numeric,'DEMO: recebimento na filial',md5(v_namespace || ':in:other:' || i)::uuid);
    end if;
    if v_transfer>0 then
      perform public.stockpro_move(v_org,v_product,v_warehouse_main,v_warehouse_reserve,'transfer',v_transfer,'DEMO: reposição da reserva',md5(v_namespace || ':transfer:' || i)::uuid);
    end if;
    if v_out>0 then
      perform public.stockpro_move(v_org,v_product,v_warehouse_main,null,'out',v_out,'DEMO: saída para atendimento',md5(v_namespace || ':out:' || i)::uuid);
    end if;
    if i<=12 then
      v_counted := v_quantity-v_transfer-v_out + case when i%3=0 then 0 when i%3=1 then 2 else -1 end;
      perform public.stockpro_count(v_org,v_product,v_warehouse_main,v_counted,
        case when i%3=0 then 'DEMO: conferência sem divergência' else 'DEMO: ajuste após contagem física' end,
        md5(v_namespace || ':count:' || i)::uuid);
    end if;
  end loop;
  insert into public.audit_events(id,organization_id,actor_id,entity_type,entity_id,action,details)
  values(v_marker,v_org,v_user,'organization',v_org,'demo_seed_completed',jsonb_build_object('version',1,'products',36,'branches',2,'warehouses',3));
  raise notice 'Demonstração criada. Empresa: %. Perfil: %. Atualize o sistema e selecione Horizonte Materiais · Demonstração.',v_org,v_user;
end
$demo$;
commit;
