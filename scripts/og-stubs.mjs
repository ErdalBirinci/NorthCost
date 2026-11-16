// The app is a single page, so a shared link can only carry one preview.
// This writes dist/r/<id>/index.html — a stub that holds the region's
// Open Graph tags and forwards the visitor to the map. Crawlers read the
// tags without running JS; people land on ?region=<id>.
//
//   node scripts/og-stubs.mjs   (runs as part of npm run build)
//
import fs from 'node:fs';
import { REGIONS, SECONDHAND } from '../src/data.js';

const BASE = 'https://erdalbirinci.github.io/NorthCost';
const OUT = 'dist/r';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = v => '€' + Math.round(v).toLocaleString('en-US');

if (!fs.existsSync('dist')) {
  console.error('dist/ not found — run vite build first');
  process.exit(1);
}

function stub({ dir, title, desc, img, back, suffix }) {
  const url = `${BASE}/r/${dir}/`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="noindex,follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="NorthCost">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/og/${img}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${BASE}/og/${img}.png">
<meta http-equiv="refresh" content="0; url=${back}">
<script>location.replace('${back}')</script>
</head><body>
<p><a href="${back}">Open ${esc(title)} on the NorthCost map</a></p>
</body></html>
`;
  fs.mkdirSync(`${OUT}/${dir}`, { recursive: true });
  fs.writeFileSync(`${OUT}/${dir}/index.html`, html);
}

let n = 0;
for (const r of REGIONS) {
  const total = r.profiles.single;
  const title = `${r.name_en} — cost of living 2026 | NorthCost`;
  const desc = `A single person needs about ${money(total)} a month in ${r.name_en}: ` +
    `1-bedroom rent ${money(r.kira1)}, groceries ${money(r.market)}, transport ${money(r.ulasim)}. ` +
    'Rent, groceries, transport and utilities for 60 Nordic regions.';
  stub({ dir: r.id, title, desc, img: r.id, back: `../../?region=${r.id}` });
  n++;

  // second-hand variants for the two countries with a regulated stock
  const f = SECONDHAND[r.country];
  if (f) {
    const totalS = total + r.kira1 * (f - 1);
    const titleS = `${r.name_en} — second-hand rents 2026 | NorthCost`;
    const descS = `On the second-hand market a single person needs about ${money(totalS)} a month in ${r.name_en} ` +
      `(1-bedroom rent ${money(r.kira1 * f)}, ×${f} vs contract). ` +
      'Rent, groceries, transport and utilities for 60 Nordic regions.';
    stub({ dir: `${r.id}/sh`, title: titleS, desc: descS, img: `${r.id}-sh`, back: `../../../?region=${r.id}&rent=sh` });
    n++;
  }
}

console.log(`✓ ${n} preview stubs → dist/r/`);
