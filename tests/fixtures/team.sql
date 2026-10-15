-- Isolated test snapshot of the team feature from 005. Not a remote schema export or deploy script.
create role anon;create role authenticated;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
create type public.member_role as enum('owner','admin','viewer');
create table public.organizations(id uuid primary key,name text);
create table public.organization_members(organization_id uuid references public.organizations,user_id uuid references auth.users,role public.member_role,primary key(organization_id,user_id));
alter table public.organization_members enable row level security;
revoke all on public.organization_members from public,anon,authenticated;
create function public.stockpro_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid())$$;
create function public.stockpro_manager(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and role::text in('owner','admin'))$$;
create function public.stockpro_owner(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and role::text='owner')$$;
revoke all on function public.stockpro_member(uuid),public.stockpro_manager(uuid),public.stockpro_owner(uuid) from public,anon;
grant execute on function public.stockpro_member(uuid),public.stockpro_manager(uuid),public.stockpro_owner(uuid) to authenticated;
create table public.organization_invitations(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,email text not null,role text not null check(role in('admin','viewer')),created_by uuid not null references auth.users,created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '7 days'),revoked_at timestamptz,accepted_at timestamptz,accepted_by uuid references auth.users);
create unique index pending_email on public.organization_invitations(organization_id,email) where accepted_at is null and revoked_at is null;
alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from public,anon,authenticated;
grant select on public.organization_invitations to authenticated;
create policy read_invites on public.organization_invitations for select to authenticated using(public.stockpro_manager(organization_id));
create table public.audit_events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,actor_id uuid references auth.users,entity_type text not null,entity_id uuid not null,action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public,anon,authenticated;
grant select on public.audit_events to authenticated;
create policy read_audit on public.audit_events for select to authenticated using(public.stockpro_manager(organization_id));
create function public.stockpro_team(p_org uuid,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not public.stockpro_member(p_org) then raise exception 'Permission denied' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>100000 then raise exception 'Invalid page';end if;
 select jsonb_build_object('count',(select count(*) from public.organization_members where organization_id=p_org),'members',coalesce((select jsonb_agg(r) from(select m.user_id,m.role::text role,left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),'Membro da equipe'),120) full_name,case when public.stockpro_manager(p_org) or m.user_id=auth.uid() then u.email else null end email from public.organization_members m join auth.users u on u.id=m.user_id where m.organization_id=p_org order by m.user_id limit 50 offset p_page*50)r),'[]'::jsonb)) into v_result;return v_result;
end $$;
create function public.stockpro_revoke_invite(p_org uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_inv public.organization_invitations;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
 select * into v_inv from public.organization_invitations where id=p_id and organization_id=p_org for update;
 if not public.stockpro_manager(p_org) or (v_inv.role='admin' and not public.stockpro_owner(p_org)) then raise exception 'Permission denied' using errcode='42501';end if;
 if v_inv.id is null or v_inv.accepted_at is not null then raise exception 'Invalid invitation';end if;
 if v_inv.revoked_at is not null then return;end if;
 update public.organization_invitations set revoked_at=now() where id=p_id;
 insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action) values(p_org,auth.uid(),'invitation',p_id,'invite_revoked');
end $$;
create function public.stockpro_invitation(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_email text;v_inv public.organization_invitations;v_name text;
begin
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required' using errcode='42501';end if;
 select * into v_inv from public.organization_invitations where id=p_id and email=v_email;
 if not found then raise exception 'Invitation unavailable';end if;
 select name into v_name from public.organizations where id=v_inv.organization_id;
 return jsonb_build_object('id',v_inv.id,'organization_name',v_name,'role',v_inv.role,'expires_at',v_inv.expires_at,'status',case when v_inv.accepted_at is not null then 'accepted' when v_inv.revoked_at is not null then 'revoked' when v_inv.expires_at<=now() then 'expired' else 'pending' end);
end $$;
create function public.stockpro_accept_invite(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_email text;v_inv public.organization_invitations;v_inviter text;v_type text;v_org uuid;
begin
 if auth.uid() is null then raise exception 'Permission denied' using errcode='42501';end if;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required' using errcode='42501';end if;
 select organization_id into v_org from public.organization_invitations where id=p_id and email=v_email;
 if v_org is null then raise exception 'Invitation unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text,2));
 select * into v_inv from public.organization_invitations where id=p_id and email=v_email for update;
 if v_inv.accepted_by=auth.uid() and exists(select 1 from public.organization_members where organization_id=v_org and user_id=auth.uid()) then return v_org;end if;
 if v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at<=now() then raise exception 'Invitation unavailable';end if;
 select role::text into v_inviter from public.organization_members where organization_id=v_org and user_id=v_inv.created_by;
 if v_inviter is null or v_inviter not in('owner','admin') or(v_inv.role='admin' and v_inviter<>'owner') then raise exception 'Invitation unavailable';end if;
 if not exists(select 1 from public.organization_members where organization_id=v_org and user_id=auth.uid()) then
 select format_type(atttypid,atttypmod) into v_type from pg_attribute where attrelid='public.organization_members'::regclass and attname='role';
 execute format('insert into public.organization_members(organization_id,user_id,role) values($1,$2,$3::%s)',v_type) using v_org,auth.uid(),v_inv.role;
 end if;
 update public.organization_invitations set accepted_at=now(),accepted_by=auth.uid() where id=p_id;
 insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action,details) values(v_org,auth.uid(),'membership',auth.uid(),'invite_accepted',jsonb_build_object('role',v_inv.role));return v_org;
end $$;
create function public.stockpro_member_action(p_org uuid,p_user uuid,p_action text,p_role text default null) returns void language plpgsql security definer set search_path='' as $$
declare v_target text;v_type text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,2));
 select role::text into v_target from public.organization_members where organization_id=p_org and user_id=p_user for update;
 if not public.stockpro_manager(p_org) or p_user=auth.uid() or v_target='owner' or(not public.stockpro_owner(p_org) and(v_target is distinct from 'viewer' or(p_action='role' and p_role is distinct from 'viewer'))) then raise exception 'Permission denied' using errcode='42501';end if;
 if v_target is null then raise exception 'Member not found';end if;
 if p_action='remove' then delete from public.organization_members where organization_id=p_org and user_id=p_user;
 elsif p_action='role' and p_role in('admin','viewer') then
 select format_type(atttypid,atttypmod) into v_type from pg_attribute where attrelid='public.organization_members'::regclass and attname='role';
 execute format('update public.organization_members set role=$1::%s where organization_id=$2 and user_id=$3',v_type) using p_role,p_org,p_user;
 else raise exception 'Invalid member action';end if;
 insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action,details) values(p_org,auth.uid(),'membership',p_user,case when p_action='remove' then 'member_removed' else 'role_changed' end,jsonb_build_object('previous_role',v_target,'role',p_role));
end $$;
revoke all on function public.stockpro_team(uuid,integer),public.stockpro_revoke_invite(uuid,uuid),public.stockpro_invitation(uuid),public.stockpro_accept_invite(uuid),public.stockpro_member_action(uuid,uuid,text,text) from public,anon;
grant execute on function public.stockpro_team(uuid,integer),public.stockpro_revoke_invite(uuid,uuid),public.stockpro_invitation(uuid),public.stockpro_accept_invite(uuid),public.stockpro_member_action(uuid,uuid,text,text) to authenticated;
-- Audit trigger snapshot for isolated tests of the already installed 005 behavior.
create table public.products(id uuid primary key,organization_id uuid not null references public.organizations,name text);
revoke all on public.products from public,anon,authenticated;
grant select,insert on public.products to authenticated;
grant update(name) on public.products to authenticated;
alter table public.products enable row level security;
create policy product_read on public.products for select to authenticated using(public.stockpro_member(organization_id));
create policy product_insert on public.products for insert to authenticated with check(public.stockpro_manager(organization_id));
create policy product_update on public.products for update to authenticated using(public.stockpro_manager(organization_id)) with check(public.stockpro_manager(organization_id));
create function public.stockpro_audit_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare v_new jsonb;v_old jsonb;v_org uuid;v_fields jsonb;
begin
 v_new:=to_jsonb(new);v_old:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 if tg_op='UPDATE' and v_new=v_old then return new;end if;
 v_org:=case when tg_table_name='organizations' then (v_new->>'id')::uuid else (v_new->>'organization_id')::uuid end;
 select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into v_fields from jsonb_object_keys(v_new) k where v_new->k is distinct from v_old->k;
 insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action,details) values(v_org,auth.uid(),tg_table_name,(v_new->>'id')::uuid,lower(tg_op),jsonb_build_object('changed_fields',v_fields));return new;
end $$;
revoke all on function public.stockpro_audit_trigger() from public,anon,authenticated;
create trigger stockpro_audit after insert or update on public.products for each row execute function public.stockpro_audit_trigger();
