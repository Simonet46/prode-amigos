-- La migración 020 invirtió incorrectamente los grupos B e I.
-- Verificado con resultados reales:
--   Grupo B: Switzerland 7pts (1°), Canada 4pts (2°)
--   Grupo I: France 9pts (1°), Norway 6pts (2°)

UPDATE public.prode_teams SET qualified_position = 1 WHERE name = 'Switzerland';
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Canada';

UPDATE public.prode_teams SET qualified_position = 1 WHERE name = 'France';
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Norway';

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
