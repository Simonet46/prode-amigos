-- Historial de pronósticos de un miembro, SOLO partidos ya cerrados
-- (kickoff pasado). Para el detalle al tocar un equipo en el Ranking.
create or replace function public.prode_user_picks(target_user uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'home', ht.name,
      'away', aw.name,
      'home_flag', ht.flag,
      'away_flag', aw.flag,
      'kickoff_at', m.kickoff_at,
      'home_score', m.home_score,
      'away_score', m.away_score,
      'pick_home', pr.home_score,
      'pick_away', pr.away_score
    ) order by m.kickoff_at desc),
    '[]'::jsonb
  )
  from public.prode_predictions pr
  join public.prode_matches m on m.id = pr.match_id
  left join public.prode_teams ht on ht.id = m.home_team_id
  left join public.prode_teams aw on aw.id = m.away_team_id
  where pr.user_id = target_user
    and m.kickoff_at is not null
    and m.kickoff_at <= now()
    and m.league_id in (select public.prode_user_league_ids());
$$;

revoke all on function public.prode_user_picks(uuid) from public;
grant execute on function public.prode_user_picks(uuid) to authenticated;
