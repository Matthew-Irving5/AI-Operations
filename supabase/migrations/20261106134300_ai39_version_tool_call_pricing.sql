drop function public.add_model_pricing(uuid, uuid, timestamptz, numeric, numeric, numeric, text);

create function public.add_model_pricing(
  p_user_id uuid,
  p_model_id uuid,
  p_effective_from timestamptz,
  p_input numeric,
  p_cached_input numeric,
  p_output numeric,
  p_web_search_per_call numeric,
  p_source_url text
) returns public.model_pricing language plpgsql security definer set search_path = public as $$
declare result public.model_pricing;
begin
  if not exists (
    select 1 from public.mfa_reauthentication_events
     where user_id = p_user_id and verified_at >= now() - interval '5 minutes'
  ) then raise exception 'fresh_mfa_required'; end if;
  if p_effective_from is null or p_input is null or p_cached_input is null
    or p_output is null or p_web_search_per_call is null or p_input <= 0
    or p_cached_input < 0 or p_output <= 0 or p_web_search_per_call < 0
    or (p_web_search_per_call = 0 and exists (
      select 1 from public.ai_model_catalog
       where id = p_model_id and supported_tools @> array['web_search']
    )) or p_source_url is null
    or p_source_url !~ '^https://([a-z0-9-]+\.)*openai\.com/' then
    raise exception 'invalid_pricing_input';
  end if;
  insert into public.model_pricing(
    model_id, effective_from, input_per_million, cached_input_per_million,
    output_per_million, web_search_per_call, source_url, verified_at
  ) values (
    p_model_id, p_effective_from, p_input, p_cached_input, p_output,
    p_web_search_per_call, p_source_url, now()
  ) on conflict (model_id, effective_from) do nothing returning * into result;
  if not found then
    select * into result from public.model_pricing
     where model_id = p_model_id and effective_from = p_effective_from;
    if result.input_per_million <> p_input
      or result.cached_input_per_million <> p_cached_input
      or result.output_per_million <> p_output
      or result.web_search_per_call <> p_web_search_per_call
      or result.source_url <> p_source_url then
      raise exception 'model_pricing_version_immutable';
    end if;
  end if;
  return result;
end; $$;

revoke all on function public.add_model_pricing(uuid, uuid, timestamptz, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated, service_role;
