// Busca las noticias más relevantes del Mundial 2026 (con imagen) en los RSS
// de medios deportivos y escribe news.json. Siempre incluye al menos una de
// la Selección Argentina. Sin dependencias: parsea el RSS con regex.
import { writeFileSync } from 'node:fs';

const FEEDS = [
  { tag: 'Argentina', source: 'Olé', url: 'https://www.ole.com.ar/rss/seleccion/' },
  { tag: 'Mundial', source: 'Olé', url: 'https://www.ole.com.ar/rss/mundial/' },
  { tag: 'Mundial', source: 'ESPN', url: 'https://www.espn.com.ar/espn/rss/news', filter: /mundial|copa del mundo/i },
];

const MAX_ITEMS = 3;
const FRESH_WINDOW_MS = 48 * 3600 * 1000;
const ARGENTINA_RE = /selecci[oó]n argentina|scaloni|messi|albiceleste/i;
const UA = { 'user-agent': 'Mozilla/5.0 (ProdeAmigosBot)' };

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

const pickImage = (item) => {
  const match = item.match(/<(?:enclosure|media:content)[^>]*url="([^"]+)"/);
  return match && /\.(jpe?g|png|webp)/i.test(match[1]) ? match[1] : '';
};

async function fetchFeed({ tag, source, url, filter }) {
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map(([, item]) => {
        const title = pickTag(item, 'title');
        const pubDate = new Date(pickTag(item, 'pubDate'));
        return {
          title,
          url: pickTag(item, 'link'),
          source,
          image: pickImage(item),
          publishedAt: Number.isNaN(pubDate.getTime()) ? new Date().toISOString() : pubDate.toISOString(),
          tag: tag === 'Mundial' && ARGENTINA_RE.test(title) ? 'Argentina' : tag,
        };
      })
      .filter((item) => item.title && item.url && (!filter || filter.test(item.title)));
  } catch (error) {
    console.error(`Feed falló (${source}): ${error.message}`);
    return [];
  }
}

// Para feeds sin imagen en el RSS (ESPN): busca el og:image de la nota.
async function resolveImage(item) {
  if (item.image) return item;
  try {
    const res = await fetch(item.url, { headers: UA });
    const html = (await res.text()).slice(0, 200000);
    const match = html.match(/property="og:image"[^>]*content="([^"]+)"|content="([^"]+)"[^>]*property="og:image"/);
    return { ...item, image: match ? (match[1] || match[2]) : '' };
  } catch {
    return item;
  }
}

const preferFresh = (items) => {
  const fresh = items.filter((item) => Date.now() - new Date(item.publishedAt).getTime() < FRESH_WINDOW_MS);
  return fresh.length ? fresh : items;
};

const normalizeTitle = (title) => title.toLowerCase().replace(/[^a-záéíóúüñ0-9 ]/g, '').slice(0, 60);

const [seleccion, mundial, espn] = await Promise.all(FEEDS.map(fetchFeed));
const argentinaPool = preferFresh(seleccion);
const generalPool = preferFresh([...mundial, ...espn].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)));

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
add(argentinaPool[0]);
generalPool.forEach(add);
argentinaPool.slice(1).forEach(add);

const withImages = await Promise.all(chosen.slice(0, MAX_ITEMS).map(resolveImage));
withImages.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

const payload = JSON.stringify({ updatedAt: new Date().toISOString(), items: withImages }, null, 2);
writeFileSync('public/news.json', payload);
writeFileSync('docs/news.json', payload);
console.log(payload);
