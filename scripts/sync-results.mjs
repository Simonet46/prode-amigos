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
// Claves ya normalizadas (solo letras, sin espacios ni signos).
const ALIASES = {
  czechia: 'czechrepublic',
  unitedstates: 'usa',
  korearepublic: 'southkorea',
  iriran: 'iran',
  cotedivoire: 'ivorycoast',
  turkiye: 'turkey',
};

const normalize = (name) => {
  const clean = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
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

// Sonda temporal: ¿prode_user_picks devuelve los especiales (009) o el formato viejo (008)?
{
  try {
    const probe = await rest('rpc/prode_user_picks', { method: 'POST', body: JSON.stringify({ target_user: '636a0b3d-a240-4268-b9b9-aa8e88da5ce5' }) });
    const tipo = Array.isArray(probe) ? 'ARRAY (008 viejo, sin especiales)' : 'OBJETO (009 ok)';
    console.log(`PROBE prode_user_picks -> ${tipo} | claves=${Array.isArray(probe) ? 'n/a' : Object.keys(probe || {}).join(',')}`);
  } catch (error) {
    console.log(`PROBE prode_user_picks -> error: ${error.message}`);
  }
}

// 1. Partidos ya empezados (últimas 72h) que todavía no tienen resultado.
const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
const now = new Date().toISOString();
const pending = await rest(
  `prode_matches?select=id,kickoff_at,home_score,home_team:prode_teams!prode_matches_home_team_id_fkey(name),away_team:prode_teams!prode_matches_away_team_id_fkey(name)` +
    `&home_score=is.null&kickoff_at=lte.${now}&kickoff_at=gte.${since}&order=kickoff_at`,
);

// Estado de los especiales (diagnóstico).
async function printSpecialsStatus() {
  try {
    const open = await rest('rpc/prode_special_predictions_open', { method: 'POST', body: '{}' });
    const settings = await rest('prode_admin_settings?key=eq.world_cup&select=value');
    const deadline = settings?.[0]?.value?.specials_deadline || 'sin prórroga';
    console.log(`Especiales: ${open ? 'ABIERTOS ✏️' : 'cerrados 🔒'} (deadline: ${deadline})`);
  } catch (error) {
    console.log(`Especiales: no se pudo consultar (${error.message})`);
  }
}

// Tabla de posiciones (diagnóstico).
async function printStandings() {
  const standings = await rest(
    'prode_profiles?select=team_name,match_points_total,exact_results_count,correct_winners_count&order=match_points_total.desc,exact_results_count.desc&limit=20',
  );
  console.log('Tabla:');
  standings.forEach((p, i) =>
    console.log(`  ${i + 1}. ${p.team_name || '(sin equipo)'} — ${p.match_points_total} pts (${p.exact_results_count} exactos, ${p.correct_winners_count} signos)`),
  );
}

// Detalle por partido terminado: pick guardado y puntos otorgados (diagnóstico).
async function printMatchDetails() {
  const finished = await rest(
    `prode_matches?select=id,home_score,away_score,home_team:prode_teams!prode_matches_home_team_id_fkey(name),away_team:prode_teams!prode_matches_away_team_id_fkey(name)` +
      `&home_score=not.is.null&kickoff_at=gte.${weekAgo}&order=kickoff_at`,
  );
  if (!finished.length) return;
  const profiles = await rest('prode_profiles?select=id,team_name');
  const nameOf = Object.fromEntries(profiles.map((p) => [p.id, p.team_name || '(sin equipo)']));
  for (const match of finished) {
    console.log(`Detalle ${match.home_team?.name} ${match.home_score}-${match.away_score} ${match.away_team?.name}:`);
    const [picks, points] = await Promise.all([
      rest(`prode_predictions?select=user_id,home_score,away_score&match_id=eq.${match.id}`),
      rest(`prode_match_points?select=user_id,points,result_type&match_id=eq.${match.id}`),
    ]);
    const ptsOf = Object.fromEntries(points.map((p) => [p.user_id, p]));
    picks
      .sort((a, b) => (ptsOf[b.user_id]?.points ?? -1) - (ptsOf[a.user_id]?.points ?? -1))
      .forEach((p) => console.log(`  ${nameOf[p.user_id]}: puso ${p.home_score}-${p.away_score} -> ${ptsOf[p.user_id]?.points ?? 'SIN FILA'} pts (${ptsOf[p.user_id]?.result_type ?? '-'})`));
  }
}

if (!pending.length) {
  console.log('No hay partidos pendientes de resultado. Nada para hacer.');
  await printSpecialsStatus();
  await printStandings();
  await printMatchDetails();
  process.exit(0);
}
console.log(`${pending.length} partido(s) esperando resultado.`);

// 2. Scoreboard de ESPN para los días involucrados. ESPN agrupa por fecha del
// Este de EE.UU. (un partido de las 02:00 UTC cae en el día anterior), así que
// consultamos esa fecha y también la UTC por las dudas.
const easternDay = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .replaceAll('-', '');
const days = [...new Set(pending.flatMap((m) => [easternDay(m.kickoff_at), m.kickoff_at.slice(0, 10).replaceAll('-', '')]))];
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
await printStandings();
