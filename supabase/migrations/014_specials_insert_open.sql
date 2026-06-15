-- Especiales abiertos SOLO para los que no cargaron:
--  - INSERT (cargar por primera vez): permitido siempre.
--  - UPDATE (cambiar un pronóstico ya hecho): solo si la ventana está abierta.
-- Como cada tabla tiene unique(user_id, league_id[, group_code]), el que ya
-- eligió no puede volver a insertar; y al estar cerrada la ventana, tampoco
-- puede modificar. El que no eligió, inserta sin problema.
create or replace function public.prode_prevent_special_change()
returns trigger
language plpgsql
as $$
begin
  if public.prode_is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and not public.prode_special_predictions_open() then
    raise exception 'special predictions locked';
  end if;
  return new;
end;
$$;
