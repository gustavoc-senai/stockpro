-- RPC restrita a status. Não amplia grants de UPDATE nem políticas de escrita.
begin;
create or replace function public.stockpro_set_catalog_status(p_org uuid,p_kind text,p_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous boolean;
begin
  if auth.uid() is null or not public.stockpro_member(p_org) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('products','categories','brands','suppliers','customers') or p_id is null or p_active is null then
    raise exception 'Invalid status input' using errcode='22023';
  end if;
  execute format('select is_active from public.%I where organization_id=$1 and id=$2 for update',p_kind) into v_previous using p_org,p_id;
  if v_previous is null then raise exception 'Record unavailable' using errcode='P0002';end if;
  if v_previous=p_active then return;end if;
  execute format('update public.%I set is_active=$3 where organization_id=$1 and id=$2',p_kind) using p_org,p_id,p_active;
  insert into public.audit_events(organization_id,actor_id,entity_type,entity_id,action,details)
  values(p_org,auth.uid(),p_kind,p_id,'status_changed',jsonb_build_object('previous',v_previous,'active',p_active));
end $$;
revoke all on function public.stockpro_set_catalog_status(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.stockpro_set_catalog_status(uuid,text,uuid,boolean) to authenticated;
commit;
