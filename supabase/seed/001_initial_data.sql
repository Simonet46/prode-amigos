insert into public.prode_avatars (code, label, palette) values
  ('CH', 'Sticker Chino', 'gold-blue'),
  ('AV', 'Sticker Agustin', 'sky-gold'),
  ('NJ', 'Sticker Nacho', 'cream-navy'),
  ('EB', 'Sticker Ezequiel', 'gold-navy'),
  ('JB', 'Sticker Juli', 'sky-cream'),
  ('NU', 'Sticker Nico Ugarte', 'gold-blue'),
  ('PB', 'Sticker Patricio', 'cream-gold'),
  ('NE', 'Sticker Nicolas Emilio', 'sky-gold'),
  ('SR', 'Sticker Seba', 'gold-navy'),
  ('AN', 'Sticker Andy', 'cream-blue'),
  ('MI', 'Sticker Miatello', 'gold-blue'),
  ('TD', 'Sticker Tomas', 'sky-cream'),
  ('MS', 'Sticker Martin', 'cream-navy'),
  ('RA', 'Sticker Rama', 'gold-blue'),
  ('CV', 'Sticker Chavo', 'sky-gold')
on conflict (code) do nothing;

insert into public.prode_leagues (name, is_private)
values ('2P Mundial 2026', true)
on conflict (name) do nothing;

insert into public.prode_groups (code, name) values
  ('A', 'Grupo A'), ('B', 'Grupo B'), ('C', 'Grupo C'), ('D', 'Grupo D'),
  ('E', 'Grupo E'), ('F', 'Grupo F'), ('G', 'Grupo G'), ('H', 'Grupo H'),
  ('I', 'Grupo I'), ('J', 'Grupo J'), ('K', 'Grupo K'), ('L', 'Grupo L')
on conflict (code) do nothing;

insert into public.prode_admin_settings (key, value)
values ('world_cup', '{"first_kickoff_at":"2026-06-11T19:00:00Z","data_mode":"manual"}')
on conflict (key) do update set value = excluded.value;
