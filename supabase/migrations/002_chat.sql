-- Chat de la liga: mensajes en tiempo real entre miembros.
create table public.prode_chat_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.prode_leagues(id) on delete cascade,
  user_id uuid not null references public.prode_profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index prode_chat_messages_league_created_idx
  on public.prode_chat_messages (league_id, created_at desc);

alter table public.prode_chat_messages enable row level security;

create policy "chat member read" on public.prode_chat_messages for select to authenticated using (
  public.prode_is_admin() or league_id in (select public.prode_user_league_ids())
);

create policy "chat member write" on public.prode_chat_messages for insert to authenticated with check (
  user_id = auth.uid() and league_id in (select public.prode_user_league_ids())
);

-- Habilita las notificaciones en tiempo real para el chat.
alter publication supabase_realtime add table public.prode_chat_messages;
