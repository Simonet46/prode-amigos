-- Corrección de posiciones de clasificados según resultados finales ESPN 28/06/2026
-- Grupos B, G, H e I estaban mal cargados.

-- Grupo B: Canada 1°, Switzerland 2° (estaba invertido)
UPDATE public.prode_teams SET qualified_position = 1 WHERE name = 'Canada';
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Switzerland';

-- Grupo G: Belgium 1°, Egypt 2°, Iran 3° (Best 8, no es top-2)
UPDATE public.prode_teams SET qualified_position = 1 WHERE name = 'Belgium';
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Egypt';
UPDATE public.prode_teams SET qualified_position = NULL WHERE name = 'Iran';

-- Grupo H: Spain 1°, Cape Verde 2°, Uruguay 3° (Best 8, no es top-2)
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Cape Verde';
UPDATE public.prode_teams SET qualified_position = NULL WHERE name = 'Uruguay';

-- Grupo I: Norway 1°, France 2° (estaba invertido)
UPDATE public.prode_teams SET qualified_position = 1 WHERE name = 'Norway';
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'France';

-- Recalcular puntos de clasificados con las posiciones corregidas
ALTER TABLE public.prode_group_qualifier_predictions DISABLE TRIGGER group_predictions_once;

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
  AND st.id = gp.second_team_id;

ALTER TABLE public.prode_group_qualifier_predictions ENABLE TRIGGER group_predictions_once;

SELECT public.prode_recalculate_profile_totals();
