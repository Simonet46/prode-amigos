import { createClient } from '@supabase/supabase-js';
import { teamFlags } from './team-flags.mjs';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const source = process.argv[2];
const leagueName = process.argv[3] || '2P Mundial 2026';

if (!url || !serviceRoleKey || !source) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-openfootball.mjs <json-url-or-file> [league-name]');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readJson(input) {
  if (/^https?:\/\//.test(input)) {
    const response = await fetch(input);
    if (!response.ok) throw new Error(`Could not fetch ${input}`);
    return response.json();
  }
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(input, 'utf8'));
}

function parseKickoff(date, time) {
  if (!date) return null;
  if (!time) return new Date(date).toISOString();
  const clean = String(time).trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})$/i);
  if (!match) return new Date(`${date} ${clean}`).toISOString();
  const [, hours, minutes, offsetHours] = match;
  const utcMillis = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    Number(hours) - Number(offsetHours),
    Number(minutes),
  );
  return new Date(utcMillis).toISOString();
}

function normalizeGroup(value) {
  const match = String(value || '').match(/([A-L])$/i);
  return match ? match[1].toUpperCase() : null;
}

function normalizeMatch(raw, index) {
  const team1 = raw.team1 || raw.home_team || raw.homeTeam || raw.home;
  const team2 = raw.team2 || raw.away_team || raw.awayTeam || raw.away;
  const round = String(raw.round || raw.matchday || '');
  const matchdayMatch = round.match(/(\d+)/);
  return {
    homeName: typeof team1 === 'string' ? team1 : team1?.name,
    awayName: typeof team2 === 'string' ? team2 : team2?.name,
    kickoff: parseKickoff(raw.date, raw.time || raw.utc_time || raw.datetime || raw.kickoff_at),
    group: normalizeGroup(raw.group || raw.group_code),
    matchday: matchdayMatch ? Number(matchdayMatch[1]) : index + 1,
    stage: round.toLowerCase().includes('matchday') ? 'group' : round || 'group',
    externalId: raw.num || raw.id || `openfootball-${index + 1}`,
  };
}

async function upsertTeam(name, groupCode) {
  if (!name || /^[WL]\d+$/i.test(name) || /^[123][A-L](\/[A-L])*$/i.test(name)) return null;
  const { data, error } = await supabase
    .from('prode_teams')
    .upsert({ name, group_code: groupCode || null, flag: teamFlags[name] || null }, { onConflict: 'name' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

const data = await readJson(source);
const { data: league, error: leagueError } = await supabase
  .from('prode_leagues')
  .select('id')
  .eq('name', leagueName)
  .single();
if (leagueError) throw leagueError;

const rawMatches = data.matches || (data.rounds || []).flatMap((round) => round.matches || []);
let imported = 0;

for (const [index, raw] of rawMatches.entries()) {
  const match = normalizeMatch(raw, index);
  if (!match.homeName || !match.awayName) continue;

  const homeTeamId = await upsertTeam(match.homeName, match.group);
  const awayTeamId = await upsertTeam(match.awayName, match.group);
  const externalId = String(match.externalId);
  const payload = {
    league_id: league.id,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    group_code: match.group,
    matchday: match.matchday,
    stage: match.stage,
    kickoff_at: match.kickoff,
    external_id: externalId,
  };

  const { data: existing, error: existingError } = await supabase
    .from('prode_matches')
    .select('id')
    .eq('league_id', league.id)
    .eq('external_id', externalId)
    .maybeSingle();
  if (existingError) throw existingError;

  const { error } = existing
    ? await supabase.from('prode_matches').update(payload).eq('id', existing.id)
    : await supabase.from('prode_matches').insert(payload);
  if (error) throw error;
  imported += 1;
}

console.log(`Imported ${imported} matches into ${leagueName}`);
