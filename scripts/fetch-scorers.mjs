// Goleadores oficiales del Mundial desde la API de ESPN -> scorers.json.
// Sin dependencias.
import { writeFileSync } from 'node:fs';

const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics', {
  headers: { 'user-agent': 'Mozilla/5.0 (ProdeAmigosBot)' },
});
if (!res.ok) throw new Error(`ESPN statistics -> HTTP ${res.status}`);
const data = await res.json();

const category = (data.stats || []).find((cat) => cat.name === 'goalsLeaders');
const items = (category?.leaders || [])
  .filter((leader) => Number(leader.value) > 0)
  .map((leader) => ({
    name: leader.athlete?.displayName || '',
    team: leader.athlete?.team?.displayName || leader.athlete?.team?.name || '',
    goals: Number(leader.value),
  }))
  .filter((item) => item.name)
  .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));

const payload = JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2);
writeFileSync('public/scorers.json', payload);
writeFileSync('docs/scorers.json', payload);
console.log(`${items.length} goleador(es) guardado(s).`);
items.slice(0, 8).forEach((item) => console.log(`  ${item.name} (${item.team}): ${item.goals}`));
