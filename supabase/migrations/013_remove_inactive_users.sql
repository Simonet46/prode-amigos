-- Elimina del prode a Nacho Juliano (nacho), Martin D.S (martin) y Rama (rama).
-- Borra su cuenta y, en cascada, sus pronósticos, puntos, mensajes de chat y
-- membresía de la liga. ES PERMANENTE.

-- 1) (Opcional) Confirmá a quiénes vas a borrar antes de seguir:
-- select id, real_name, team_name, username
-- from public.prode_profiles where username in ('nacho', 'martin', 'rama');

-- 2) Borrado en cascada desde auth.users:
delete from auth.users
where id in (
  '5913ac79-953d-4aa5-8393-57dcb4f159fd', -- Nacho Juliano (nacho)
  '4ea37257-7650-48b6-8337-e15358c307e4', -- Martin D.S (martin)
  'e4042b81-be23-4607-a5f3-312a6dc70244'  -- Rama (rama)
);

-- 3) Verificación: deberían quedar 12 jugadores.
select count(*) as jugadores_restantes from public.prode_profiles;
