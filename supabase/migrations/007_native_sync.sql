-- Sincronización de resultados nativa de Supabase (pg_cron, cada minuto):
-- la base conoce los kickoffs y chequea ESPN solo cuando un partido está por
-- terminar (90+ minutos desde el inicio). Además: fix del UPDATE sin WHERE
-- que bloqueaba el recálculo vía API, backfill de puntos pendientes (Corea),
-- y realtime en prode_matches para que la página abierta se entere al instante.

-- 1) Fix: la API bloquea UPDATE sin WHERE.
create or replace function public.prode_recalculate_profile_totals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prode_profiles p set
    exact_results_count = (
      select count(*)::int from public.prode_match_points mp
      where mp.user_id = p.id and mp.result_type = 'exact'
    ),
    correct_winners_count = (
      select count(*)::int from public.prode_match_points mp
      where mp.user_id = p.id and mp.result_type = 'winner_or_draw'
    ),
    match_points_total = (
      select coalesce(sum(mp.points), 0)::int from public.prode_match_points mp
      where mp.user_id = p.id
    ),
    group_qualifier_points = (
      select coalesce(sum(gp.points), 0)::int from public.prode_group_qualifier_predictions gp
      where gp.user_id = p.id
    ),
    top_scorer_bonus = (
      select coalesce(sum(ts.points), 0)::int from public.prode_top_scorer_predictions ts
      where ts.user_id = p.id
    ),
    champion_bonus = (
      select coalesce(sum(cp.points), 0)::int from public.prode_champion_predictions cp
      where cp.user_id = p.id
    )
  where p.id is not null;
end;
$$;

-- 2) Nombres ESPN -> nombres del fixture (openfootball).
create or replace function public.prode_norm_team(name text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(name, '')))
    when 'czechia' then 'czech republic'
    when 'united states' then 'usa'
    when 'korea republic' then 'south korea'
    when 'ir iran' then 'iran'
    when 'türkiye' then 'turkey'
    else lower(btrim(coalesce(name, '')))
  end;
$$;

-- 3) Extensiones para el reloj nativo.
create extension if not exists pg_cron;
create extension if not exists http with schema extensions;

-- 4) El robot dentro de la base.
create or replace function public.prode_sync_results()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  days text[];
  day text;
  resp jsonb;
  ev jsonb;
  comp jsonb;
  hteam text;
  ateam text;
  hs int;
  aws int;
  m record;
  updated int := 0;
  repaired int := 0;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Auto-reparación: partidos con resultado pero sin puntos.
  for m in
    select pm.id from public.prode_matches pm
    where pm.home_score is not null and pm.away_score is not null
      and not exists (select 1 from public.prode_match_points mp where mp.match_id = pm.id)
  loop
    perform public.prode_calculate_match_points(m.id);
    repaired := repaired + 1;
  end loop;

  -- Ventana inteligente: partidos que empezaron hace 90+ minutos y siguen sin resultado.
  select array_agg(distinct to_char(pm.kickoff_at at time zone 'America/New_York', 'YYYYMMDD')) into days
  from public.prode_matches pm
  where pm.home_score is null
    and pm.kickoff_at <= now() - interval '90 minutes'
    and pm.kickoff_at > now() - interval '12 hours';

  if days is null then
    return format('reparados=%s, sin partidos por terminar', repaired);
  end if;

  foreach day in array days loop
    begin
      select content::jsonb into resp
      from extensions.http_get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=' || day);
    exception when others then
      continue; -- ESPN caído: se reintenta en un minuto
    end;

    for ev in select * from jsonb_array_elements(coalesce(resp->'events', '[]'::jsonb)) loop
      comp := ev->'competitions'->0;
      if not coalesce((comp->'status'->'type'->>'completed')::boolean, false) then
        continue;
      end if;

      select public.prode_norm_team(x->'team'->>'name'), (x->>'score')::int into hteam, hs
      from jsonb_array_elements(comp->'competitors') x where x->>'homeAway' = 'home';
      select public.prode_norm_team(x->'team'->>'name'), (x->>'score')::int into ateam, aws
      from jsonb_array_elements(comp->'competitors') x where x->>'homeAway' = 'away';

      for m in
        select pm.id, public.prode_norm_team(ht.name) = hteam as direct
        from public.prode_matches pm
        join public.prode_teams ht on ht.id = pm.home_team_id
        join public.prode_teams aw on aw.id = pm.away_team_id
        where pm.home_score is null
          and abs(extract(epoch from (pm.kickoff_at - (ev->>'date')::timestamptz))) < 4 * 3600
          and (
            (public.prode_norm_team(ht.name) = hteam and public.prode_norm_team(aw.name) = ateam)
            or (public.prode_norm_team(ht.name) = ateam and public.prode_norm_team(aw.name) = hteam)
          )
      loop
        update public.prode_matches
          set home_score = case when m.direct then hs else aws end,
              away_score = case when m.direct then aws else hs end,
              status = 'finished'
          where id = m.id;
        perform public.prode_calculate_match_points(m.id);
        updated := updated + 1;
      end loop;
    end loop;
  end loop;

  return format('reparados=%s, cargados=%s', repaired, updated);
end;
$$;

-- 5) El reloj: cada minuto (sale al instante si no hay partidos por terminar).
select cron.schedule('prode-sync-results', '* * * * *', 'select public.prode_sync_results()');

-- 6) Realtime: la página abierta se entera apenas cambia un partido.
do $$
begin
  alter publication supabase_realtime add table public.prode_matches;
exception when duplicate_object then null;
end $$;

-- 7) Backfill inmediato: reparte los puntos que estén pendientes (Corea 2-1)
-- y carga cualquier final que ESPN ya tenga publicado.
select public.prode_sync_results();
