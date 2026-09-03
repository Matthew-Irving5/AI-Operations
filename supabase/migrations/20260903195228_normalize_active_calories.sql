-- Accept the Apple Shortcuts label "Active Calories" as the canonical
-- active-energy metric. The raw reported label and value remain immutable.
create or replace function public.normalize_mobile_active_calories_alias()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
  v_unit text;
  v_value_text text;
  v_value numeric;
begin
  if new.status <> 'deferred_unknown_type' then
    return new;
  end if;

  select lower(trim(reported_type)), lower(trim(reported_unit)),
    trim(reported_value #>> '{}')
  into v_type, v_unit, v_value_text
  from public.mobile_health_sample_items
  where id = new.health_sample_id;

  if v_type <> 'active calories'
    or v_value_text !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
  then
    return new;
  end if;

  v_value := v_value_text::numeric;
  if v_unit in ('kcal', 'cal') then
    new.normalized_value := v_value;
    new.normalized_unit := 'kcal';
  elsif v_unit = 'kj' then
    new.normalized_value := v_value / 4.184;
    new.normalized_unit := 'kcal';
  else
    new.status := 'deferred_unknown_unit';
    new.canonical_metric := 'active_energy';
    return new;
  end if;

  new.status := 'normalized';
  new.canonical_metric := 'active_energy';
  return new;
end;
$$;

create trigger normalize_mobile_active_calories_alias
before insert or update on public.mobile_health_sample_normalizations
for each row execute function public.normalize_mobile_active_calories_alias();

update public.mobile_health_sample_normalizations as normalization
set status = case
      when lower(trim(sample.reported_unit)) in ('kcal', 'cal', 'kj')
        then 'normalized'
      else 'deferred_unknown_unit'
    end,
    canonical_metric = 'active_energy',
    normalized_value = case
      when lower(trim(sample.reported_unit)) in ('kcal', 'cal')
        then trim(sample.reported_value #>> '{}')::numeric
      when lower(trim(sample.reported_unit)) = 'kj'
        then trim(sample.reported_value #>> '{}')::numeric / 4.184
      else null
    end,
    normalized_unit = case
      when lower(trim(sample.reported_unit)) in ('kcal', 'cal', 'kj')
        then 'kcal'
      else null
    end
from public.mobile_health_sample_items as sample
where sample.id = normalization.health_sample_id
  and normalization.status = 'deferred_unknown_type'
  and lower(trim(sample.reported_type)) = 'active calories'
  and trim(sample.reported_value #>> '{}')
    ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$';

revoke all on function public.normalize_mobile_active_calories_alias() from public;
grant execute on function public.normalize_mobile_active_calories_alias() to service_role;
