import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const csvPath = process.argv[2];

if (!url || !serviceRoleKey || !csvPath) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-players-csv.mjs players.csv');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (field || row.length) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (char === '\r' && next === '\n') i += 1;
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const rows = parseCsv(await readFile(csvPath, 'utf8'));
const headers = rows.shift().map((header) => header.trim().toLowerCase());
const teamIndex = headers.indexOf('team');
const nameIndex = headers.indexOf('name');
const positionIndex = headers.indexOf('position');

if (teamIndex === -1 || nameIndex === -1) {
  throw new Error('CSV must include team,name columns. Optional: position');
}

let imported = 0;
for (const row of rows) {
  const teamName = row[teamIndex]?.trim();
  const playerName = row[nameIndex]?.trim();
  const position = positionIndex >= 0 ? row[positionIndex]?.trim() : null;
  if (!teamName || !playerName) continue;

  const { data: team, error: teamError } = await supabase
    .from('prode_teams')
    .select('id')
    .eq('name', teamName)
    .single();
  if (teamError) throw new Error(`Team not found for ${playerName}: ${teamName}`);

  const { error } = await supabase
    .from('prode_players')
    .upsert({ team_id: team.id, name: playerName, position: position || null }, { onConflict: 'team_id,name' });
  if (error) throw error;
  imported += 1;
}

console.log(`Imported ${imported} players`);
