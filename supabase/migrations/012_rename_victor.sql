-- Renombra el equipo "Victor el Nazi" -> "Victor".
-- En el editor SQL corrés como postgres (auth.uid() es null), así que el
-- candado de nombre de equipo no se dispara.
update public.prode_profiles
set team_name = 'Victor'
where team_name = 'Victor el Nazi';

select team_name, real_name from public.prode_profiles where team_name = 'Victor';
