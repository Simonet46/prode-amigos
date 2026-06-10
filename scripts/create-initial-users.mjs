import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  ['Chino Simonet', 'chino', 'CH', true, '2026chino'],
  ['Agustin Vanella', 'agustin', 'AV', false, '2026agustin'],
  ['Nacho Juliano', 'nacho', 'NJ', false, '2026nacho'],
  ['Ezequiel Bruschi', 'eze', 'EB', false, '2026eze'],
  ['Juli B.R', 'juli', 'JB', false, '2026juli'],
  ['Nico Ugarte', 'nicou', 'NU', false, '2026nicou'],
  ['Patricio Brown', 'patricio', 'PB', false, '2026patricio'],
  ['Nicolas Emilio', 'nicoe', 'NE', false, '2026nicoe'],
  ['Seba Raggio', 'seba', 'SR', false, '2026seba'],
  ['Andy Verd', 'andy', 'AN', false, '2026andy'],
  ['Miatellodoni', 'miatello', 'MI', false, '2026miatello'],
  ['Tomas Dinn', 'tomas', 'TD', false, '2026tomas'],
  ['Martin D.S', 'martin', 'MS', false, '2026martin'],
  ['Rama', 'rama', 'RA', false, '2026rama'],
  ['Sergio', 'sergio', 'CV', false, '2026sergio'],
];

const { data: league, error: leagueError } = await supabase
  .from('prode_leagues')
  .select('id')
  .eq('name', '2P Mundial 2026')
  .single();

if (leagueError) throw leagueError;

for (const [realName, username, avatarCode, isAdmin, password] of users) {
  const email = `${username}@prodeamigos.local`;
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing.users.find((user) => user.email === email);
  const authUser = found
    ? found
    : (await supabase.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
  if (found) {
    const { error: passwordError } = await supabase.auth.admin.updateUserById(found.id, { password });
    if (passwordError) throw passwordError;
  }

  const { data: avatar } = await supabase.from('prode_avatars').select('id').eq('code', avatarCode).single();

  const { error: profileError } = await supabase.from('prode_profiles').upsert({
    id: authUser.id,
    username,
    real_name: realName,
    avatar_id: avatar?.id,
    is_admin: isAdmin,
  });
  if (profileError) throw profileError;

  const { error: memberError } = await supabase.from('prode_league_members').upsert({
    league_id: league.id,
    user_id: authUser.id,
    role: isAdmin ? 'admin' : 'player',
  });
  if (memberError) throw memberError;

  console.log(`Ready: ${realName} (${username})`);
}
