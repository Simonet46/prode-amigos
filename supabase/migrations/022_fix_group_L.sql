-- Grupo L: England 1° (7pts), Croatia 2° (6pts), Ghana 3° Best8 (4pts)
-- Ghana estaba incorrectamente como 2° en la DB.
UPDATE public.prode_teams SET qualified_position = 2 WHERE name = 'Croatia';
UPDATE public.prode_teams SET qualified_position = NULL WHERE name = 'Ghana';

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
