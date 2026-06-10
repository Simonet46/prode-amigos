import { createClient } from '@supabase/supabase-js';
import { teamFlags } from './team-flags.mjs';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let updated = 0;
for (const [name, flag] of Object.entries(teamFlags)) {
  const { error } = await supabase.from('prode_teams').update({ flag }).eq('name', name);
  if (error) throw error;
  updated += 1;
}

console.log(`Updated ${updated} team flags`);
