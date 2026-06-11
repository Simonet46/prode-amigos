// Busca las noticias más relevantes del Mundial 2026 en Google News RSS
// y escribe news.json (siempre incluye al menos una de la Selección Argentina).
// Sin dependencias: parsea el RSS con regex.
import { writeFileSync } from 'node:fs';

const FEEDS = [
  {
    tag: 'Argentina',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('"Selección Argentina" Mundial 2026')}&hl=es-419&gl=AR&ceid=AR:es-419`,
  },
  {
    tag: 'Mundial',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent('"Mundial 2026" selecciones')}&hl=es-419&gl=AR&ceid=AR:es-419`,
  },
];

const MAX_ITEMS = 3;
const FRESH_WINDOW_MS = 48 * 3600 * 1000;

const decode = (value) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

const pickTag = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decode(match[1]) : '';
};

async function fetchFeed({ tag, url }) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (ProdeAmigosBot)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      let title = pickTag(item, 'title');
      const source = pickTag(item, 'source');
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const pubDate = new Date(pickTag(item, 'pubDate'));
      return {
        title,
        url: pickTag(item, 'link'),
        source,
        publishedAt: Number.isNaN(pubDate.getTime()) ? new Date().toISOString() : pubDate.toISOString(),
        tag,
      };
    })
    .filter((item) => item.title && item.url);
}

const preferFresh = (items) => {
  const fresh = items.filter((item) => Date.now() - new Date(item.publishedAt).getTime() < FRESH_WINDOW_MS);
  return fresh.length ? fresh : items;
};

const normalizeTitle = (title) => title.toLowerCase().replace(/[^a-záéíóúüñ0-9 ]/g, '').slice(0, 60);

const [argentina, general] = await Promise.all(FEEDS.map(fetchFeed));
const argentinaFresh = preferFresh(argentina);
const generalFresh = preferFresh(general);

const chosen = [];
const seen = new Set();
const add = (item) => {
  if (!item || chosen.length >= MAX_ITEMS) return;
  const key = normalizeTitle(item.title);
  if (seen.has(key)) return;
  seen.add(key);
  chosen.push(item);
};

// Regla: siempre al menos una de Argentina.
add(argentinaFresh[0]);
generalFresh.forEach(add);
argentinaFresh.slice(1).forEach(add);

chosen.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

const payload = JSON.stringify({ updatedAt: new Date().toISOString(), items: chosen.slice(0, MAX_ITEMS) }, null, 2);
writeFileSync('public/news.json', payload);
writeFileSync('docs/news.json', payload);
console.log(payload);
