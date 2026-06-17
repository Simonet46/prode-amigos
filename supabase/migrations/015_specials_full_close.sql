-- Cierre total de los especiales: una vez cerrada la ventana, nadie inserta ni
-- modifica (ni los que no cargaron). Revierte la apertura para rezagados (014).
create or replace function public.prode_prevent_special_change()
returns trigger
language plpgsql
as $$
begin
  if public.prode_is_admin() then
    return new;
  end if;
  if not public.prode_special_predictions_open() then
    raise exception 'special predictions locked';
  end if;
  return new;
end;
$$;
