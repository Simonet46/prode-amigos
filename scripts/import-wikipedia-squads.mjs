import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sourceUrl = process.argv[2] || 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads';

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const teamNameMap = {
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Czechia': 'Czech Republic',
  'Democratic Republic of the Congo': 'DR Congo',
  'United States': 'USA',
  "Côte d'Ivoire": 'Ivory Coast',
  'Ivory Coast': 'Ivory Coast',
  'South Korea': 'South Korea',
};

function normalizeText(value) {
  return String(value || '').replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
}

function wikipediaId(name) {
  return name.replace(/ /g, '_').replace(/&/g, 'and');
}

function findSquadTable($, teamName) {
  const candidates = [teamName, Object.entries(teamNameMap).find(([, local]) => local === teamName)?.[0]]
    .filter(Boolean)
    .map(wikipediaId);
  for (const id of candidates) {
    const heading = $(`[id="${id.replace(/"/g, '\\"')}"]`).parent();
    if (!heading.length) continue;
    let cursor = heading.next();
    while (cursor.length && !/^h[23]$/i.test(cursor[0].tagName)) {
      if (cursor.is('table.wikitable')) return cursor;
      cursor = cursor.next();
    }
  }
  return null;
}

const html = await fetch(sourceUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not fetch ${sourceUrl}`);
  return response.text();
});
const $ = cheerio.load(html);

const { data: teams, error: teamsError } = await supabase.from('prode_teams').select('id,name').order('name');
if (teamsError) throw teamsError;

let imported = 0;
const missing = [];

for (const team of teams) {
  const table = findSquadTable($, team.name);
  if (!table) {
    missing.push(team.name);
    continue;
  }

  const headers = table
    .find('tr')
    .first()
    .find('th,td')
    .map((_, cell) => normalizeText($(cell).text()).toLowerCase())
    .get();
  const playerIndex = headers.indexOf('player');
  const positionIndex = headers.indexOf('pos.');

  if (playerIndex === -1) {
    missing.push(team.name);
    continue;
  }

  const players = [];
  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('th,td');
    const rawNameCell = cells.eq(playerIndex);
    const linkName = normalizeText(rawNameCell.find('a').first().text());
    const playerName = linkName || normalizeText(rawNameCell.text());
    const rawPosition = positionIndex >= 0 ? normalizeText(cells.eq(positionIndex).text()) : null;
    const position = rawPosition?.replace(/^\d+/, '') || null;
    if (playerName) players.push({ name: playerName, position });
  });

  if (!players.length) {
    missing.push(team.name);
    continue;
  }

  for (const player of players) {
    const { error } = await supabase
      .from('prode_players')
      .upsert({ team_id: team.id, name: player.name, position: player.position }, { onConflict: 'team_id,name' });
    if (error) throw error;
    imported += 1;
  }
}

console.log(JSON.stringify({ imported, missingTeams: missing }, null, 2));
