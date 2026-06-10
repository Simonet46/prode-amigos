import sharp from 'sharp';

const ink = '#f8f3df';
const muted = '#aebbd0';

const badge = (x, y, w, h, rotate = -3) => `
  <g transform="translate(${x} ${y}) rotate(${rotate})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${w * 0.16}" fill="url(#goldGrad)" stroke="rgba(255,255,255,0.6)" stroke-width="${w * 0.04}" />
    <text x="${w / 2}" y="${h / 2}" dy="${h * 0.13}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="${h * 0.42}" fill="#06101f">PA</text>
  </g>`;

const defs = `
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050b16" />
      <stop offset="0.5" stop-color="#0a1830" />
      <stop offset="1" stop-color="#10283a" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#ffe2a0" />
      <stop offset="0.6" stop-color="#e7bd55" />
      <stop offset="1" stop-color="#a66f1f" />
    </linearGradient>
  </defs>`;

const pitch = (cx, cy, r, opacity = 0.07) => `
  <g stroke="${ink}" stroke-opacity="${opacity}" fill="none" stroke-width="3">
    <circle cx="${cx}" cy="${cy}" r="${r}" />
    <circle cx="${cx}" cy="${cy}" r="${r * 0.35}" />
    <line x1="${cx - r * 1.4}" y1="${cy}" x2="${cx + r * 1.4}" y2="${cy}" />
  </g>`;

const og = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  ${pitch(1020, 315, 260)}
  ${pitch(120, 560, 180, 0.05)}
  ${badge(110, 180, 190, 240)}
  <text x="360" y="300" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="92" fill="${ink}">PRODE AMIGOS</text>
  <text x="364" y="372" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="44" fill="#e7bd55">2P · MUNDIAL 2026</text>
  <text x="364" y="438" font-family="Arial, Helvetica, sans-serif" font-weight="500" font-size="30" fill="${muted}">Pronósticos, ranking y gloria entre amigos.</text>
</svg>`;

const appIcon = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  ${defs}
  <rect width="512" height="512" rx="96" fill="url(#bgGrad)" />
  ${pitch(256, 256, 300, 0.06)}
  ${badge(126, 106, 250, 300, -3)}
</svg>`;

await sharp(Buffer.from(og)).png().toFile('public/og-image.png');
await sharp(Buffer.from(appIcon)).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(Buffer.from(appIcon)).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(Buffer.from(appIcon)).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('Brand assets generados en public/');
