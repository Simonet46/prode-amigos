-- Prórroga de los especiales: reabre goleador, campeón y clasificados de grupo
-- hasta una fecha límite configurable (specials_deadline en admin settings), y
-- permite MODIFICAR las elecciones mientras la ventana esté abierta.

-- 1) La ventana considera la prórroga además del primer kickoff.
create or replace function public.prode_special_predictions_open()
returns boolean
language sql
stable
as $$
  select coalesce(
    greatest(
      public.prode_first_world_cup_kickoff(),
      (select (value->>'specials_deadline')::timestamptz
       from public.prode_admin_settings where key = 'world_cup')
    ) > now(),
    true
  );
$$;

-- 2) Mientras la ventana esté abierta se puede modificar; cerrada, nada.
create or replace function public.prode_prevent_special_change()
returns trigger
language plpgsql
as $$
begin
  if not public.prode_special_predictions_open() and not public.prode_is_admin() then
    raise exception 'special predictions locked';
  end if;
  return new;
end;
$$;

-- 3) Permiso de actualización sobre las filas propias (el trigger pone el límite temporal).
drop policy if exists "group picks own update" on public.prode_group_qualifier_predictions;
create policy "group picks own update" on public.prode_group_qualifier_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "top scorer own update" on public.prode_top_scorer_predictions;
create policy "top scorer own update" on public.prode_top_scorer_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "champion own update" on public.prode_champion_predictions;
create policy "champion own update" on public.prode_champion_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) Abrir la prórroga: 2 días desde ahora.
insert into public.prode_admin_settings (key, value)
values ('world_cup', jsonb_build_object('specials_deadline', to_char(now() + interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SSOF')))
on conflict (key) do update
  set value = coalesce(public.prode_admin_settings.value, '{}'::jsonb) || excluded.value,
      updated_at = now();

-- Verificación: debería decir "t" (abierto) y la fecha límite.
select public.prode_special_predictions_open() as abierto,
       (select value->>'specials_deadline' from public.prode_admin_settings where key = 'world_cup') as hasta;
