-- Carga los clasificados del Mundial 2026 (fase de grupos completa, datos ESPN 25/06/2026)
-- y calcula los puntos de cada predicción de clasificados.

-- 1. Marcar posición real de los 24 clasificados
UPDATE public.prode_teams SET qualified_position = CASE
  WHEN name = 'Mexico'        THEN 1  -- Grupo A
  WHEN name = 'South Africa'  THEN 2  -- Grupo A
  WHEN name = 'Switzerland'   THEN 1  -- Grupo B
  WHEN name = 'Canada'        THEN 2  -- Grupo B
  WHEN name = 'Brazil'        THEN 1  -- Grupo C
  WHEN name = 'Morocco'       THEN 2  -- Grupo C
  WHEN name = 'USA'           THEN 1  -- Grupo D
  WHEN name = 'Australia'     THEN 2  -- Grupo D
  WHEN name = 'Germany'       THEN 1  -- Grupo E
  WHEN name = 'Ivory Coast'   THEN 2  -- Grupo E
  WHEN name = 'Netherlands'   THEN 1  -- Grupo F
  WHEN name = 'Japan'         THEN 2  -- Grupo F
  WHEN name = 'Egypt'         THEN 1  -- Grupo G
  WHEN name = 'Iran'          THEN 2  -- Grupo G
  WHEN name = 'Spain'         THEN 1  -- Grupo H
  WHEN name = 'Uruguay'       THEN 2  -- Grupo H
  WHEN name = 'France'        THEN 1  -- Grupo I
  WHEN name = 'Norway'        THEN 2  -- Grupo I
  WHEN name = 'Argentina'     THEN 1  -- Grupo J
  WHEN name = 'Austria'       THEN 2  -- Grupo J
  WHEN name = 'Colombia'      THEN 1  -- Grupo K
  WHEN name = 'Portugal'      THEN 2  -- Grupo K
  WHEN name = 'England'       THEN 1  -- Grupo L
  WHEN name = 'Ghana'         THEN 2  -- Grupo L
END
WHERE name IN (
  'Mexico','South Africa','Switzerland','Canada','Brazil','Morocco',
  'USA','Australia','Germany','Ivory Coast','Netherlands','Japan',
  'Egypt','Iran','Spain','Uruguay','France','Norway',
  'Argentina','Austria','Colombia','Portugal','England','Ghana'
);

-- 2. Desactivar trigger (service role no tiene auth.jwt → prode_is_admin() = false)
ALTER TABLE public.prode_group_qualifier_predictions DISABLE TRIGGER group_predictions_once;

-- 3. Calcular puntos por predicción de clasificados
--    1st pick en pos=1: 2pts | 1st pick en pos=2: 1pt | no clasificó: 0
--    2nd pick en pos=2: 2pts | 2nd pick en pos=1: 1pt | no clasificó: 0
UPDATE public.prode_group_qualifier_predictions gp
SET points = (
  CASE WHEN ft.qualified_position = 1 THEN 2
       WHEN ft.qualified_position = 2 THEN 1
       ELSE 0 END
  +
  CASE WHEN st.qualified_position = 2 THEN 2
       WHEN st.qualified_position = 1 THEN 1
       ELSE 0 END
)
FROM public.prode_teams ft, public.prode_teams st
WHERE ft.id = gp.first_team_id
  AND st.id = gp.second_team_id
  AND (ft.qualified_position IS NOT NULL OR st.qualified_position IS NOT NULL);

-- 4. Re-habilitar trigger
ALTER TABLE public.prode_group_qualifier_predictions ENABLE TRIGGER group_predictions_once;

-- 5. Recalcular totales de perfiles
SELECT public.prode_recalculate_profile_totals();
