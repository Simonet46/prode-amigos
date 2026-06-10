create extension if not exists pgcrypto;

create table public.prode_avatars (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  palette text not null default 'gold-blue'
);

create table public.prode_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  real_name text not null,
  team_name text unique,
  avatar_id uuid references public.prode_avatars(id),
  is_admin boolean not null default false,
  exact_results_count integer not null default 0,
  correct_winners_count integer not null default 0,
  match_points_total integer not null default 0,
  group_qualifier_points integer not null default 0,
  top_scorer_bonus integer not null default 0,
  champion_bonus integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_name_once check (team_name is null or length(trim(team_name)) >= 3)
);

create table public.prode_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.prode_league_members (
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.prode_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  flag text,
  group_code text,
  qualified_position integer check (qualified_position in (1, 2)),
  is_champion boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.prode_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.prode_teams(id) on delete set null,
  name text not null,
  position text,
  created_at timestamptz not null default now(),
  unique (team_id, name)
);

create table public.prode_groups (
  code text primary key,
  name text not null,
  first_team_id uuid references public.prode_teams(id),
  second_team_id uuid references public.prode_teams(id)
);

create table public.prode_matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  home_team_id uuid references public.prode_teams(id),
  away_team_id uuid references public.prode_teams(id),
  group_code text references public.prode_groups(code),
  matchday integer not null default 1,
  stage text not null default 'group',
  kickoff_at timestamptz,
  home_score integer,
  away_score integer,
  status text not null default 'open' check (status in ('open', 'locked', 'finished', 'points_calculated')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint non_negative_scores check ((home_score is null or home_score >= 0) and (away_score is null or away_score >= 0))
);

create table public.prode_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  match_id uuid not null references public.prode_matches(id) on delete cascade,
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.prode_group_qualifier_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  group_code text not null references public.prode_groups(code),
  first_team_id uuid not null references public.prode_teams(id),
  second_team_id uuid not null references public.prode_teams(id),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, league_id, group_code),
  constraint distinct_group_picks check (first_team_id <> second_team_id)
);

create table public.prode_top_scorer_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  player_id uuid not null references public.prode_players(id),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);

create table public.prode_champion_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  team_id uuid not null references public.prode_teams(id),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);

create table public.prode_match_points (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.prode_predictions(id) on delete cascade unique,
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  match_id uuid not null references public.prode_matches(id) on delete cascade,
  points integer not null default 0,
  result_type text not null default 'incorrect' check (result_type in ('exact', 'winner_or_draw', 'incorrect')),
  calculated_at timestamptz not null default now()
);

create table public.prode_scorer_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.prode_players(id) on delete cascade,
  goals integer not null default 0 check (goals >= 0),
  stage text not null default 'group',
  updated_at timestamptz not null default now(),
  unique (player_id, stage)
);

create table public.prode_admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index on public.prode_league_members(user_id);
create index on public.prode_matches(league_id, matchday, kickoff_at);
create index on public.prode_predictions(user_id, match_id);
create index on public.prode_match_points(user_id);

create or replace function public.prode_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prode_profiles
    where id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.prode_user_league_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select league_id from public.prode_league_members where user_id = auth.uid();
$$;

create or replace function public.prode_first_world_cup_kickoff()
returns timestamptz
language sql
stable
as $$
  select coalesce(
    (select (value->>'first_kickoff_at')::timestamptz from public.prode_admin_settings where key = 'world_cup'),
    (select min(kickoff_at) from public.prode_matches where kickoff_at is not null)
  );
$$;

create or replace function public.prode_prediction_is_editable(match_uuid uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select kickoff_at > now() from public.prode_matches where id = match_uuid), false);
$$;

create or replace function public.prode_special_predictions_open()
returns boolean
language sql
stable
as $$
  select coalesce(public.prode_first_world_cup_kickoff() > now(), true);
$$;

create or replace function public.prode_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.prode_profiles
for each row execute function public.prode_touch_updated_at();

create trigger matches_touch_updated_at before update on public.prode_matches
for each row execute function public.prode_touch_updated_at();

create trigger predictions_touch_updated_at before update on public.prode_predictions
for each row execute function public.prode_touch_updated_at();

create or replace function public.prode_prevent_team_name_change()
returns trigger
language plpgsql
as $$
begin
  if old.team_name is not null and new.team_name is distinct from old.team_name then
    raise exception 'team name cannot be changed';
  end if;
  new.username = old.username;
  new.real_name = old.real_name;
  new.avatar_id = old.avatar_id;
  new.is_admin = old.is_admin;
  return new;
end;
$$;

create trigger profiles_prevent_locked_fields before update on public.prode_profiles
for each row when (auth.uid() = old.id and not public.prode_is_admin())
execute function public.prode_prevent_team_name_change();

create or replace function public.prode_prevent_locked_prediction()
returns trigger
language plpgsql
as $$
begin
  if not public.prode_prediction_is_editable(new.match_id) and not public.prode_is_admin() then
    raise exception 'prediction locked';
  end if;
  return new;
end;
$$;

create trigger predictions_lock_guard before insert or update on public.prode_predictions
for each row execute function public.prode_prevent_locked_prediction();

create or replace function public.prode_prevent_special_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and not public.prode_is_admin() then
    raise exception 'special prediction cannot be changed';
  end if;
  if not public.prode_special_predictions_open() and not public.prode_is_admin() then
    raise exception 'special predictions locked';
  end if;
  return new;
end;
$$;

create trigger group_predictions_once before insert or update on public.prode_group_qualifier_predictions
for each row execute function public.prode_prevent_special_change();

create trigger top_scorer_once before insert or update on public.prode_top_scorer_predictions
for each row execute function public.prode_prevent_special_change();

create trigger champion_once before insert or update on public.prode_champion_predictions
for each row execute function public.prode_prevent_special_change();

create or replace function public.prode_create_default_predictions_for_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prode_predictions (user_id, league_id, match_id, home_score, away_score)
  select user_id, new.league_id, new.id, 0, 0
  from public.prode_league_members
  where league_id = new.league_id
  on conflict (user_id, match_id) do nothing;
  return new;
end;
$$;

create trigger matches_create_default_predictions after insert on public.prode_matches
for each row execute function public.prode_create_default_predictions_for_match();

create or replace function public.prode_create_default_predictions_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.prode_predictions (user_id, league_id, match_id, home_score, away_score)
  select new.user_id, new.league_id, id, 0, 0
  from public.prode_matches
  where league_id = new.league_id
  on conflict (user_id, match_id) do nothing;
  return new;
end;
$$;

create trigger members_create_default_predictions after insert on public.prode_league_members
for each row execute function public.prode_create_default_predictions_for_member();

create or replace function public.prode_calculate_match_points(match_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  if not public.prode_is_admin() then
    raise exception 'admin only';
  end if;

  select * into m from public.prode_matches where id = match_uuid;
  if m.home_score is null or m.away_score is null then
    raise exception 'match result missing';
  end if;

  insert into public.prode_match_points (prediction_id, user_id, match_id, points, result_type)
  select
    p.id,
    p.user_id,
    p.match_id,
    case
      when p.home_score = m.home_score and p.away_score = m.away_score then 3
      when sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score) then 1
      else 0
    end,
    case
      when p.home_score = m.home_score and p.away_score = m.away_score then 'exact'
      when sign(p.home_score - p.away_score) = sign(m.home_score - m.away_score) then 'winner_or_draw'
      else 'incorrect'
    end
  from public.prode_predictions p
  where p.match_id = match_uuid
  on conflict (prediction_id) do update set
    points = excluded.points,
    result_type = excluded.result_type,
    calculated_at = now();

  update public.prode_matches set status = 'points_calculated' where id = match_uuid;
  perform public.prode_recalculate_profile_totals();
end;
$$;

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
    );
end;
$$;

alter table public.prode_avatars enable row level security;
alter table public.prode_profiles enable row level security;
alter table public.prode_leagues enable row level security;
alter table public.prode_league_members enable row level security;
alter table public.prode_teams enable row level security;
alter table public.prode_players enable row level security;
alter table public.prode_groups enable row level security;
alter table public.prode_matches enable row level security;
alter table public.prode_predictions enable row level security;
alter table public.prode_group_qualifier_predictions enable row level security;
alter table public.prode_top_scorer_predictions enable row level security;
alter table public.prode_champion_predictions enable row level security;
alter table public.prode_match_points enable row level security;
alter table public.prode_scorer_stats enable row level security;
alter table public.prode_admin_settings enable row level security;

create policy "avatars readable" on public.prode_avatars for select to authenticated using (true);
create policy "avatars admin write" on public.prode_avatars for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "profiles same league readable" on public.prode_profiles for select to authenticated using (
  id = auth.uid()
  or public.prode_is_admin()
  or exists (
    select 1 from public.prode_league_members me
    join public.prode_league_members them on them.league_id = me.league_id
    where me.user_id = auth.uid() and them.user_id = prode_profiles.id
  )
);
create policy "profiles own onboarding update" on public.prode_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin write" on public.prode_profiles for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "leagues member read" on public.prode_leagues for select to authenticated using (
  public.prode_is_admin() or id in (select public.prode_user_league_ids())
);
create policy "leagues admin write" on public.prode_leagues for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "league members member read" on public.prode_league_members for select to authenticated using (
  public.prode_is_admin() or league_id in (select public.prode_user_league_ids())
);
create policy "league members admin write" on public.prode_league_members for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "teams readable" on public.prode_teams for select to authenticated using (true);
create policy "teams admin write" on public.prode_teams for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "players readable" on public.prode_players for select to authenticated using (true);
create policy "players admin write" on public.prode_players for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "groups readable" on public.prode_groups for select to authenticated using (true);
create policy "groups admin write" on public.prode_groups for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "matches member read" on public.prode_matches for select to authenticated using (
  public.prode_is_admin() or league_id in (select public.prode_user_league_ids())
);
create policy "matches admin write" on public.prode_matches for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "own predictions read" on public.prode_predictions for select to authenticated using (
  user_id = auth.uid()
  or public.prode_is_admin()
  or exists (
    select 1 from public.prode_matches m
    where m.id = prode_predictions.match_id
      and m.league_id in (select public.prode_user_league_ids())
      and m.kickoff_at <= now()
      and m.matchday <= (
        select max(m2.matchday)
        from public.prode_matches m2
        where m2.league_id = m.league_id and m2.kickoff_at <= now()
      )
  )
);
create policy "own predictions insert" on public.prode_predictions for insert to authenticated with check (
  user_id = auth.uid()
  and league_id in (select public.prode_user_league_ids())
  and public.prode_prediction_is_editable(match_id)
);
create policy "own predictions update" on public.prode_predictions for update to authenticated using (
  user_id = auth.uid() and public.prode_prediction_is_editable(match_id)
) with check (
  user_id = auth.uid() and public.prode_prediction_is_editable(match_id)
);
create policy "predictions admin write" on public.prode_predictions for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "group picks member read" on public.prode_group_qualifier_predictions for select to authenticated using (
  public.prode_is_admin()
  or user_id = auth.uid()
  or league_id in (select public.prode_user_league_ids())
);
create policy "group picks own insert" on public.prode_group_qualifier_predictions for insert to authenticated with check (
  user_id = auth.uid() and league_id in (select public.prode_user_league_ids())
);
create policy "group picks admin write" on public.prode_group_qualifier_predictions for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "top scorer picks member read" on public.prode_top_scorer_predictions for select to authenticated using (
  public.prode_is_admin() or user_id = auth.uid() or league_id in (select public.prode_user_league_ids())
);
create policy "top scorer own insert" on public.prode_top_scorer_predictions for insert to authenticated with check (
  user_id = auth.uid() and league_id in (select public.prode_user_league_ids())
);
create policy "top scorer admin write" on public.prode_top_scorer_predictions for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "champion picks member read" on public.prode_champion_predictions for select to authenticated using (
  public.prode_is_admin() or user_id = auth.uid() or league_id in (select public.prode_user_league_ids())
);
create policy "champion own insert" on public.prode_champion_predictions for insert to authenticated with check (
  user_id = auth.uid() and league_id in (select public.prode_user_league_ids())
);
create policy "champion admin write" on public.prode_champion_predictions for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "match points member read" on public.prode_match_points for select to authenticated using (
  public.prode_is_admin()
  or user_id = auth.uid()
  or exists (
    select 1 from public.prode_matches m
    where m.id = prode_match_points.match_id and m.league_id in (select public.prode_user_league_ids())
  )
);
create policy "match points admin write" on public.prode_match_points for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "scorers readable" on public.prode_scorer_stats for select to authenticated using (true);
create policy "scorers admin write" on public.prode_scorer_stats for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());

create policy "settings readable" on public.prode_admin_settings for select to authenticated using (true);
create policy "settings admin write" on public.prode_admin_settings for all to authenticated using (public.prode_is_admin()) with check (public.prode_is_admin());
