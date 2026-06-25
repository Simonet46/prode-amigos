-- Amplía prode_user_picks para incluir el detalle de pronósticos de clasificados
-- por grupo, con la posición real que obtuvo cada equipo pronosticado.
-- Solo devuelve grupos donde al menos un equipo ya clasificó.
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
    ),
    'groupQualifiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_code', gp.group_code,
        'points', gp.points,
        'first_team', ft.name,
        'first_flag', ft.flag,
        'first_actual_pos', ft.qualified_position,
        'second_team', st.name,
        'second_flag', st.flag,
        'second_actual_pos', st.qualified_position,
        'group_decided', (
          select count(*)::int >= 2
          from public.prode_teams t
          where t.group_code = gp.group_code
            and t.qualified_position is not null
        )
      ) order by gp.group_code)
      from public.prode_group_qualifier_predictions gp
      join public.prode_teams ft on ft.id = gp.first_team_id
      join public.prode_teams st on st.id = gp.second_team_id
      where gp.user_id = target_user
        and (ft.qualified_position is not null or st.qualified_position is not null)
    ), '[]'::jsonb)
  ) end;
$$;
