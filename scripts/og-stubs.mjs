// The app is a single page, so a shared link can only carry one preview.
// This writes dist/r/<id>/index.html — a stub that holds the region's
// Open Graph tags and forwards the visitor to the map. Crawlers read the
// tags without running JS; people land on ?region=<id>.
//
//   node scripts/og-stubs.mjs   (runs as part of npm run build)
//
import fs from 'node:fs';
import { REGIONS } from '../src/data.js';

const BASE = 'https://erdalbirinci.github.io/NorthCost';
const OUT = 'dist/r';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = v => '€' + Math.round(v).toLocaleString('en-US');

if (!fs.existsSync('dist')) {
  console.error('dist/ not found — run vite build first');
  process.exit(1);
}

for (const r of REGIONS) {
  const url = `${BASE}/r/${r.id}/`;
  const total = r.profiles.single;
  const title = `${r.name_en} — cost of living 2026 | NorthCost`;
  const desc = `A single person needs about ${money(total)} a month in ${r.name_en}: ` +
    `1-bedroom rent ${money(r.kira1)}, groceries ${money(r.market)}, transport ${money(r.ulasim)}. ` +
    'Rent, groceries, transport and utilities for 60 Nordic regions.';
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
<meta property="og:image" content="${BASE}/og/${r.id}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(r.name_en)} cost of living card">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${BASE}/og/${r.id}.png">
<meta http-equiv="refresh" content="0; url=../../?region=${r.id}">
<script>location.replace('../../?region=${r.id}')</script>
</head><body>
<p><a href="../../?region=${r.id}">Open ${esc(r.name_en)} on the NorthCost map</a></p>
</body></html>
`;
  fs.mkdirSync(`${OUT}/${r.id}`, { recursive: true });
  fs.writeFileSync(`${OUT}/${r.id}/index.html`, html);
}

console.log(`✓ ${REGIONS.length} preview stubs → dist/r/`);
