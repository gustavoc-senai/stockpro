-- Local contract doubles for checking the demo script, NOT a deployment schema.
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table profiles(id uuid primary key references auth.users,full_name text);
create table organizations(id uuid primary key,name text);
create table organization_members(organization_id uuid references organizations,user_id uuid references auth.users,role text,primary key(organization_id,user_id));
create function stockpro_owner(p_org uuid) returns boolean language sql stable as $$select exists(select 1 from organization_members where organization_id=p_org and user_id=auth.uid() and role='owner')$$;
create table branches(id uuid primary key,organization_id uuid not null references organizations,name text,is_active boolean default true,unique(organization_id,id));
create table warehouses(id uuid primary key,organization_id uuid not null references organizations,branch_id uuid,name text,is_active boolean default true,unique(organization_id,id),foreign key(organization_id,branch_id) references branches(organization_id,id));
create table categories(id uuid primary key,organization_id uuid not null references organizations,name text,description text,is_active boolean,unique(organization_id,id));
create table brands(like categories including all);
create table suppliers(id uuid primary key,organization_id uuid not null references organizations,name text,email text,phone text,document text,is_active boolean,unique(organization_id,id));
create table customers(like suppliers including all);
create table products(id uuid primary key,organization_id uuid not null references organizations,name text,sku text,unit text,minimum_stock numeric,category_id uuid,brand_id uuid,supplier_id uuid,is_active boolean,unique(organization_id,id),unique(organization_id,sku),foreign key(organization_id,category_id) references categories(organization_id,id),foreign key(organization_id,brand_id) references brands(organization_id,id),foreign key(organization_id,supplier_id) references suppliers(organization_id,id));
create table stock_balances(organization_id uuid,product_id uuid,warehouse_id uuid,quantity numeric not null check(quantity>=0),primary key(organization_id,product_id,warehouse_id),foreign key(organization_id,product_id) references products(organization_id,id),foreign key(organization_id,warehouse_id) references warehouses(organization_id,id));
create table stock_movements(id uuid primary key default gen_random_uuid(),organization_id uuid,product_id uuid,warehouse_id uuid,destination_id uuid,kind text,quantity numeric check(quantity>0),note text,request_id uuid unique);
create table stock_counts(id uuid primary key default gen_random_uuid(),organization_id uuid,product_id uuid,warehouse_id uuid,previous_quantity numeric,counted_quantity numeric,difference numeric,reason text,request_id uuid unique);
create table audit_events(id uuid primary key,organization_id uuid references organizations,actor_id uuid references auth.users,entity_type text,entity_id uuid,action text,details jsonb);
create function stockpro_onboard(p_name text,p_branch text,p_warehouse text,p_request_id uuid) returns uuid language plpgsql as $$
declare o uuid:=p_request_id;b uuid:=gen_random_uuid();
begin
 if exists(select 1 from organizations where id=o) then return o;end if;
 insert into organizations values(o,p_name);
 insert into organization_members values(o,auth.uid(),'owner');
 insert into branches values(b,o,p_branch,true);
 insert into warehouses values(gen_random_uuid(),o,b,p_warehouse,true);
 return o;
end $$;
create function stockpro_move(p_org uuid,p_product uuid,p_warehouse uuid,p_destination uuid,p_kind text,p_quantity numeric,p_note text,p_request_id uuid) returns uuid language plpgsql as $$
declare v_id uuid;v_balance numeric;
begin
 if not stockpro_owner(p_org) then raise exception 'Permission denied';end if;
 select id into v_id from stock_movements where request_id=p_request_id;if found then return v_id;end if;
 insert into stock_balances values(p_org,p_product,p_warehouse,0) on conflict do nothing;
 if p_kind='in' then update stock_balances set quantity=quantity+p_quantity where organization_id=p_org and product_id=p_product and warehouse_id=p_warehouse;
 else
  select quantity into v_balance from stock_balances where organization_id=p_org and product_id=p_product and warehouse_id=p_warehouse;
  if v_balance<p_quantity then raise exception 'Insufficient stock';end if;
  update stock_balances set quantity=quantity-p_quantity where organization_id=p_org and product_id=p_product and warehouse_id=p_warehouse;
  if p_kind='transfer' then insert into stock_balances values(p_org,p_product,p_destination,p_quantity) on conflict(organization_id,product_id,warehouse_id) do update set quantity=stock_balances.quantity+excluded.quantity;end if;
 end if;
 insert into stock_movements(organization_id,product_id,warehouse_id,destination_id,kind,quantity,note,request_id) values(p_org,p_product,p_warehouse,p_destination,p_kind,p_quantity,p_note,p_request_id) returning id into v_id;return v_id;
end $$;
create function stockpro_count(p_org uuid,p_product uuid,p_warehouse uuid,p_counted numeric,p_reason text,p_request_id uuid) returns uuid language plpgsql as $$
declare v_before numeric;v_diff numeric;v_id uuid;
begin
 select id into v_id from stock_counts where request_id=p_request_id;if found then return v_id;end if;
 select quantity into v_before from stock_balances where organization_id=p_org and product_id=p_product and warehouse_id=p_warehouse;
 v_diff:=p_counted-v_before;
 if v_diff<>0 then perform stockpro_move(p_org,p_product,p_warehouse,null,case when v_diff>0 then 'in' else 'out' end,abs(v_diff),p_reason,p_request_id);end if;
 insert into stock_counts(organization_id,product_id,warehouse_id,previous_quantity,counted_quantity,difference,reason,request_id) values(p_org,p_product,p_warehouse,v_before,p_counted,v_diff,p_reason,p_request_id) returning id into v_id;return v_id;
end $$;
