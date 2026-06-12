// Sincroniza resultados oficiales del Mundial desde la API pública de ESPN
// hacia prode_matches, y dispara el recálculo de puntos del schema.
// Sin dependencias. Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-results.mjs
//   DRY_RUN=1 para ver qué haría sin escribir.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ESPN usa algunos nombres distintos a openfootball (la fuente del fixture).
const ALIASES = {
  czechia: 'czech republic',
  'united states': 'usa',
  'south korea': 'south korea',
  'korea republic': 'south korea',
  'ir iran': 'iran',
  'côte d’ivoire': 'ivory coast',
  "cote d'ivoire": 'ivory coast',
  türkiye: 'turkey',
  turkiye: 'turkey',
};

const normalize = (name) => {
  const clean = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim();
  return ALIASES[clean] || clean;
};

async function rest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS, ...options });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// 0. Auto-reparación: partidos con resultado cargado pero sin puntos repartidos
// (por ejemplo si una corrida anterior falló a mitad de camino).
const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
const finishedMatches = await rest(
  `prode_matches?select=id&home_score=not.is.null&away_score=not.is.null&kickoff_at=gte.${weekAgo}`,
);
if (finishedMatches.length) {
  const ids = finishedMatches.map((m) => m.id);
  const pointRows = await rest(`prode_match_points?select=match_id&match_id=in.(${ids.join(',')})`);
  const withPoints = new Set(pointRows.map((r) => r.match_id));
  for (const id of ids.filter((matchId) => !withPoints.has(matchId))) {
    console.log(`  ♻ Reparando puntos faltantes del partido ${id}`);
    await rest('rpc/prode_calculate_match_points', { method: 'POST', body: JSON.stringify({ match_uuid: id }) });
    console.log('    ✔ puntos recalculados');
  }
}

// 1. Partidos ya empezados (últimas 72h) que todavía no tienen resultado.
const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
const now = new Date().toISOString();
const pending = await rest(
  `prode_matches?select=id,kickoff_at,home_score,home_team:prode_teams!prode_matches_home_team_id_fkey(name),away_team:prode_teams!prode_matches_away_team_id_fkey(name)` +
    `&home_score=is.null&kickoff_at=lte.${now}&kickoff_at=gte.${since}&order=kickoff_at`,
);

if (!pending.length) {
  console.log('No hay partidos pendientes de resultado. Nada para hacer.');
  process.exit(0);
}
console.log(`${pending.length} partido(s) esperando resultado.`);

// 2. Scoreboard de ESPN para los días (UTC) involucrados.
const days = [...new Set(pending.map((m) => m.kickoff_at.slice(0, 10).replaceAll('-', '')))];
const finished = [];
for (const day of days) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${day}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (ProdeAmigosBot)' },
  });
  if (!res.ok) {
    console.error(`ESPN ${day} -> HTTP ${res.status}, salteo el día`);
    continue;
  }
  const data = await res.json();
  for (const event of data.events || []) {
    const comp = event.competitions?.[0];
    if (!comp || !comp.status?.type?.completed) continue;
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    finished.push({
      home: normalize(home.team.name),
      away: normalize(away.team.name),
      homeScore: Number(home.score),
      awayScore: Number(away.score),
      date: new Date(event.date),
      label: `${home.team.name} ${home.score}-${away.score} ${away.team.name}`,
    });
  }
}
console.log(`${finished.length} resultado(s) final(es) en ESPN para ${days.join(', ')}.`);

// 3. Matchear por nombres normalizados + horario (±4h) y actualizar.
let updated = 0;
for (const match of pending) {
  const home = normalize(match.home_team?.name);
  const away = normalize(match.away_team?.name);
  const kickoff = new Date(match.kickoff_at);
  const result = finished.find(
    (r) => ((r.home === home && r.away === away) || (r.home === away && r.away === home))
      && Math.abs(r.date - kickoff) < 4 * 3600 * 1000,
  );
  if (!result) {
    console.log(`  Sin resultado todavía: ${match.home_team?.name} vs ${match.away_team?.name}`);
    continue;
  }
  const reversed = result.home === away;
  const homeScore = reversed ? result.awayScore : result.homeScore;
  const awayScore = reversed ? result.homeScore : result.awayScore;
  console.log(`  ✔ ${match.home_team?.name} ${homeScore}-${awayScore} ${match.away_team?.name} (ESPN: ${result.label})${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (DRY_RUN) continue;
  await rest(`prode_matches?id=eq.${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ home_score: homeScore, away_score: awayScore, status: 'finished' }),
  });
  await rest('rpc/prode_calculate_match_points', {
    method: 'POST',
    body: JSON.stringify({ match_uuid: match.id }),
  });
  updated += 1;
}

console.log(updated ? `Listo: ${updated} resultado(s) cargado(s) y puntos recalculados.` : 'Sin actualizaciones.');
