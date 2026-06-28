-- Asigna equipos a los 16 partidos de 16avos de final (datos ESPN 28/06/2026)
-- y otorga 5 pts de goleador a quien eligió a Messi (Ezequiel Bruschi).

-- 16avos de final: asignar home/away por kickoff_at
UPDATE public.prode_matches SET
  home_team_id = 'be8ae2cd-687f-4593-8a89-cd38c5a680fc',  -- Canada
  away_team_id = 'b75f143c-8c53-41ad-83d5-e8420869aed1'   -- South Africa
WHERE kickoff_at = '2026-06-28 19:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = 'c8eaf025-c7e5-403b-acb1-75bc272f3975',  -- Brazil
  away_team_id = '0581ee71-e635-46de-b244-90d747eed075'   -- Japan
WHERE kickoff_at = '2026-06-29 17:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '08b215c3-e86d-4cb4-b33a-ad250fdc6196',  -- Germany
  away_team_id = '47172930-de12-4548-b4db-8ae470e8700d'   -- Paraguay
WHERE kickoff_at = '2026-06-29 20:30:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '6d6698e2-880d-4aa3-8567-773f17d8010e',  -- Netherlands
  away_team_id = '6af3ab4a-2301-4739-86db-6931fea0262e'   -- Morocco
WHERE kickoff_at = '2026-06-30 01:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = 'babf6a14-c018-427f-bc48-5ede1f730410',  -- Ivory Coast
  away_team_id = '6363e4f2-6c69-40a6-93a2-d5ba31c46fb6'   -- Norway
WHERE kickoff_at = '2026-06-30 17:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '31499e76-ca46-4e6a-a6f8-6baf1baebbb3',  -- France
  away_team_id = '1b6130b0-3779-45ff-bcfc-dbe3c3952bd0'   -- Sweden
WHERE kickoff_at = '2026-06-30 21:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = 'b4dd4800-d327-4a83-b644-c5d80ad4df42',  -- Mexico
  away_team_id = '6a5db030-322a-4622-b6f2-5583865a91a3'   -- Ecuador
WHERE kickoff_at = '2026-07-01 01:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '1dcc18b2-a61b-414e-a76e-4443f48754cf',  -- England
  away_team_id = '8e7670f0-bc4d-4e0f-b9a9-8814beecc792'   -- DR Congo
WHERE kickoff_at = '2026-07-01 16:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '99582ad1-0753-44c1-925f-97414af51901',  -- Belgium
  away_team_id = '9174cb34-a5ec-4154-aac9-551fbf273619'   -- Senegal
WHERE kickoff_at = '2026-07-01 20:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '82897dd7-25ec-49ac-872a-292e603c935c',  -- USA
  away_team_id = 'b6656b52-0817-4e42-90ad-8e540a120720'   -- Bosnia & Herzegovina
WHERE kickoff_at = '2026-07-02 00:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '97201aef-9e98-4802-afcb-9c558dc0a8ce',  -- Spain
  away_team_id = '078f6997-5894-4ba0-8181-3928986b04b6'   -- Austria
WHERE kickoff_at = '2026-07-02 19:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '4242e079-3cec-49ef-bdd5-b854ebc56b56',  -- Portugal
  away_team_id = '00a49204-bf62-48a6-b767-645cd3f5eb5c'   -- Croatia
WHERE kickoff_at = '2026-07-02 23:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = 'f118a518-3711-433b-bf30-ab7683a4d7f2',  -- Switzerland
  away_team_id = '78c872f9-ca61-498a-aeff-9237de20fd23'   -- Algeria
WHERE kickoff_at = '2026-07-03 03:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '8b698525-1e6a-4404-8c8f-d1ac0fa9370d',  -- Australia
  away_team_id = '734695d3-7a3c-458d-a7fa-bfaf37dd3b73'   -- Egypt
WHERE kickoff_at = '2026-07-03 18:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = 'af3b5d92-0527-4bb7-ade2-df44e4e3db89',  -- Argentina
  away_team_id = '958461a2-f2c4-4fe4-b392-a9cd1fb2177a'   -- Cape Verde
WHERE kickoff_at = '2026-07-03 22:00:00+00' AND home_team_id IS NULL;

UPDATE public.prode_matches SET
  home_team_id = '1c20fcdf-04b4-4295-859a-f33df2ece002',  -- Colombia
  away_team_id = '09271e91-f390-4564-a337-2bbfd74f96ac'   -- Ghana
WHERE kickoff_at = '2026-07-04 01:30:00+00' AND home_team_id IS NULL;

-- Goleador: Messi lidera con 6 goles → 5 pts a Ezequiel Bruschi (La Scaloneta papá!!)
ALTER TABLE public.prode_top_scorer_predictions DISABLE TRIGGER top_scorer_once;

UPDATE public.prode_top_scorer_predictions ts
SET points = 5
FROM public.prode_players pl
WHERE ts.player_id = pl.id
  AND pl.name = 'Lionel Messi';

ALTER TABLE public.prode_top_scorer_predictions ENABLE TRIGGER top_scorer_once;

SELECT public.prode_recalculate_profile_totals();
