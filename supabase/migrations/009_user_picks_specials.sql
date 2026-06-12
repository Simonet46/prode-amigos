-- Amplía el historial por equipo del Ranking: ahora también devuelve el
-- goleador y el campeón que eligió ese miembro (solo cuando los especiales
-- ya cerraron, es decir después del primer kickoff del Mundial).
-- Reemplaza prode_user_picks (008): ahora devuelve un objeto, no una lista.
create or replace function public.prode_user_picks(target_user uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select exists (
      select 1
      from public.prode_league_members me
      join public.prode_league_members them on them.league_id = me.league_id
      where me.user_id = auth.uid() and them.user_id = target_user
    ) as ok
  )
  select case when not (select ok from allowed) then '{}'::jsonb else jsonb_build_object(
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'home', ht.name,
        'away', aw.name,
        'home_flag', ht.flag,
        'away_flag', aw.flag,
        'kickoff_at', m.kickoff_at,
        'home_score', m.home_score,
        'away_score', m.away_score,
        'pick_home', pr.home_score,
        'pick_away', pr.away_score
      ) order by m.kickoff_at desc)
      from public.prode_predictions pr
      join public.prode_matches m on m.id = pr.match_id
      left join public.prode_teams ht on ht.id = m.home_team_id
      left join public.prode_teams aw on aw.id = m.away_team_id
      where pr.user_id = target_user
        and m.kickoff_at is not null
        and m.kickoff_at <= now()
        and m.league_id in (select public.prode_user_league_ids())
    ), '[]'::jsonb),
    'topScorer', (
      select jsonb_build_object('player', pl.name, 'team', t.name, 'flag', t.flag)
      from public.prode_top_scorer_predictions ts
      join public.prode_players pl on pl.id = ts.player_id
      left join public.prode_teams t on t.id = pl.team_id
      where ts.user_id = target_user
        and not public.prode_special_predictions_open()
      limit 1
    ),
    'champion', (
      select jsonb_build_object('team', t.name, 'flag', t.flag)
      from public.prode_champion_predictions cp
      join public.prode_teams t on t.id = cp.team_id
      where cp.user_id = target_user
        and not public.prode_special_predictions_open()
      limit 1
    )
  ) end;
$$;

revoke all on function public.prode_user_picks(uuid) from public;
grant execute on function public.prode_user_picks(uuid) to authenticated;
