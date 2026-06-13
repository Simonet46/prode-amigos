-- Web 100% autónoma: resultados Y goleadores se refrescan dentro de Supabase
-- vía pg_cron, sin depender del cron de GitHub (impuntual).

-- 1) Normalizador robusto: saca acentos y todo lo que no sea letra/número, para
-- que "Bosnia & Herzegovina" y "Bosnia-Herzegovina" (ESPN) converjan al mismo valor.
create or replace function public.prode_norm_team(name text)
returns text
language sql
immutable
as $$
  select case n
    when 'czechia' then 'czechrepublic'
    when 'unitedstates' then 'usa'
    when 'korearepublic' then 'southkorea'
    when 'iriran' then 'iran'
    when 'turkiye' then 'turkey'
    when 'cotedivoire' then 'ivorycoast'
    else n
  end
  from (
    select regexp_replace(
      lower(translate(coalesce(name, ''),
        'áàäâãéèëêíìïîóòöôõúùüûñçš',
        'aaaaaeeeeiiiiooooouuuuncs')),
      '[^a-z0-9]', '', 'g'
    ) as n
  ) s;
$$;

-- 2) Goleadores oficiales del Mundial: el robot los trae de ESPN y los guarda en
-- la base (key 'scorers'). El frontend los lee de ahí.
create or replace function public.prode_sync_scorers()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resp jsonb;
  cat jsonb;
  scorers jsonb;
begin
  begin
    select content::jsonb into resp
    from extensions.http_get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics');
  exception when others then
    return 'espn no disponible';
  end;

  select c into cat
  from jsonb_array_elements(coalesce(resp->'stats', '[]'::jsonb)) c
  where c->>'name' = 'goalsLeaders'
  limit 1;

  if cat is null then
    return 'sin categoría de goles';
  end if;

  select jsonb_agg(item order by goals desc, name)
  into scorers
  from (
    select
      l->'athlete'->>'displayName' as name,
      coalesce(l->'athlete'->'team'->>'displayName', l->'athlete'->'team'->>'name') as team,
      floor((l->>'value')::numeric)::int as goals,
      jsonb_build_object(
        'name', l->'athlete'->>'displayName',
        'team', coalesce(l->'athlete'->'team'->>'displayName', l->'athlete'->'team'->>'name'),
        'goals', floor((l->>'value')::numeric)::int
      ) as item
    from jsonb_array_elements(cat->'leaders') l
    where (l->>'value')::numeric > 0
  ) ranked;

  insert into public.prode_admin_settings (key, value)
  values ('scorers', jsonb_build_object('updatedAt', now(), 'items', coalesce(scorers, '[]'::jsonb)))
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return format('goleadores=%s', jsonb_array_length(coalesce(scorers, '[]'::jsonb)));
end;
$$;

-- 3) Programación: goleadores cada 10 minutos (resultados ya corren cada minuto).
select cron.unschedule('prode-sync-scorers') where exists (select 1 from cron.job where jobname = 'prode-sync-scorers');
select cron.schedule('prode-sync-scorers', '*/10 * * * *', 'select public.prode_sync_scorers()');

-- 4) Backfill inmediato: corre ambos ahora.
select public.prode_sync_scorers() as goleadores;
select public.prode_sync_results() as resultados;
