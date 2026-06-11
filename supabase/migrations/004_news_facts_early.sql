-- Agrega a los hechos de la Crónica: quiénes faltan completar los primeros
-- 3 partidos del torneo (la "siesta del siglo"). Reemplaza la función 003.
create or replace function public.prode_news_facts()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with my_leagues as (
  select public.prode_user_league_ids() as league_id
),
league_members as (
  select p.id,
         coalesce(nullif(p.team_name, ''), p.real_name) as team_name,
         coalesce(p.match_points_total, 0) + coalesce(p.group_qualifier_points, 0)
           + coalesce(p.top_scorer_bonus, 0) + coalesce(p.champion_bonus, 0) as total,
         coalesce(p.exact_results_count, 0) as exacts
  from public.prode_profiles p
  join public.prode_league_members lm on lm.user_id = p.id
  where lm.league_id in (select league_id from my_leagues)
),
recent_locked as (
  select m.id, ht.name as home, aw.name as away, m.home_score, m.away_score, m.kickoff_at
  from public.prode_matches m
  left join public.prode_teams ht on ht.id = m.home_team_id
  left join public.prode_teams aw on aw.id = m.away_team_id
  where m.league_id in (select league_id from my_leagues)
    and m.kickoff_at <= now()
    and m.kickoff_at > now() - interval '48 hours'
),
locked_picks as (
  select rl.home, rl.away, rl.home_score, rl.away_score, rl.kickoff_at,
         jsonb_agg(jsonb_build_object(
           'team', lmem.team_name,
           'home', pr.home_score,
           'away', pr.away_score
         ) order by lmem.team_name) as picks
  from recent_locked rl
  join public.prode_predictions pr on pr.match_id = rl.id
  join league_members lmem on lmem.id = pr.user_id
  group by rl.id, rl.home, rl.away, rl.home_score, rl.away_score, rl.kickoff_at
),
today_matches as (
  select m.id, ht.name as home, aw.name as away, m.kickoff_at
  from public.prode_matches m
  left join public.prode_teams ht on ht.id = m.home_team_id
  left join public.prode_teams aw on aw.id = m.away_team_id
  where m.league_id in (select league_id from my_leagues)
    and m.kickoff_at > now()
    and m.kickoff_at < now() + interval '24 hours'
),
missing_today as (
  select tm.home, tm.away, tm.kickoff_at,
         coalesce((
           select jsonb_agg(l.team_name order by l.team_name)
           from league_members l
           where not exists (
             select 1 from public.prode_predictions pr
             where pr.match_id = tm.id and pr.user_id = l.id
           )
         ), '[]'::jsonb) as absent
  from today_matches tm
),
early_matches as (
  select m.id, ht.name as home, aw.name as away, m.kickoff_at
  from public.prode_matches m
  left join public.prode_teams ht on ht.id = m.home_team_id
  left join public.prode_teams aw on aw.id = m.away_team_id
  where m.league_id in (select league_id from my_leagues)
    and m.kickoff_at is not null
  order by m.kickoff_at asc
  limit 3
),
early_missing as (
  select l.team_name
  from league_members l
  where exists (
    select 1 from early_matches em
    where not exists (
      select 1 from public.prode_predictions pr
      where pr.match_id = em.id and pr.user_id = l.id
    )
  )
)
select jsonb_build_object(
  'generatedAt', now(),
  'standings', coalesce((
    select jsonb_agg(jsonb_build_object('team', team_name, 'total', total, 'exacts', exacts)
      order by total desc, exacts desc, team_name)
    from league_members
  ), '[]'::jsonb),
  'lockedPicks', coalesce((select jsonb_agg(to_jsonb(lp) - 'id') from locked_picks lp), '[]'::jsonb),
  'todayMissing', coalesce((select jsonb_agg(to_jsonb(ms)) from missing_today ms), '[]'::jsonb),
  'earlyMatches', coalesce((
    select jsonb_agg(jsonb_build_object('home', home, 'away', away) order by kickoff_at)
    from early_matches
  ), '[]'::jsonb),
  'earlyMissing', coalesce((select jsonb_agg(team_name order by team_name) from early_missing), '[]'::jsonb)
);
$$;
