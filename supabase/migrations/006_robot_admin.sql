-- El robot de resultados entra con la clave service_role (sin usuario humano):
-- prode_is_admin() ahora también lo reconoce como admin. Los usuarios normales
-- tienen rol "authenticated" en su JWT, así que nada cambia para ellos.
create or replace function public.prode_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (
      select 1 from public.prode_profiles
      where id = auth.uid() and is_admin = true
    );
$$;

-- Backfill: reparte los puntos de los partidos que ya tienen resultado cargado
-- (México 2-0 Sudáfrica quedó cargado pero sin puntos por el guardia viejo).
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

select public.prode_calculate_match_points(id)
from public.prode_matches
where home_score is not null and away_score is not null;
