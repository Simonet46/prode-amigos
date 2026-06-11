-- Pronósticos de toda la liga para un partido, SOLO si ya cerró (kickoff pasado).
-- El que mira tiene que ser miembro de la liga del partido.
create or replace function public.prode_match_picks(match_uuid uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', pr.user_id,
      'home', pr.home_score,
      'away', pr.away_score
    )),
    '[]'::jsonb
  )
  from public.prode_predictions pr
  join public.prode_matches m on m.id = pr.match_id
  where pr.match_id = match_uuid
    and m.kickoff_at is not null
    and m.kickoff_at <= now()
    and m.league_id in (select public.prode_user_league_ids());
$$;

revoke all on function public.prode_match_picks(uuid) from public;
grant execute on function public.prode_match_picks(uuid) to authenticated;
