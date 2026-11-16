// Renders one 1200x630 social preview card per region into public/og/.
// Uses the headless Chrome/Edge already installed on the machine, so the cards
// are plain files committed with the site — no runtime dependency.
//
//   npm run og
//
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { REGIONS, CURRENCIES, SECONDHAND, effRegion } from '../src/data.js';

const OUT = 'public/og';
const TMP = 'scripts/.og-tmp';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));

if (!CHROME) {
  console.error('no Chrome/Edge found for rendering');
  process.exit(1);
}

// Windows Chrome renders flag emoji as bare ISO letters, so the card spells the country out.
const COUNTRY = { FI: 'Finland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark' };
const eur = n => '€' + Math.round(n).toLocaleString('en-US');
const kr = (n, cur) => Math.round(n * CURRENCIES[cur].rate).toLocaleString('sv-SE') + ' kr';

function card(r, mode) {
  const v = mode === 'sh' ? effRegion(r, true) : r;
  const f = SECONDHAND[r.country];
  const rent = v.kira1, pass = v.aylikKart, food = v.market, total = v.profiles.single;
  const where = COUNTRY[r.country]
    ? COUNTRY[r.country] + (r.geo ? ' · ' + r.geo : '') + (mode === 'sh' ? ` · 🔑 2nd-hand ×${f}` : '')
    : '';
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;position:relative;background:#0b0f19;
    font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#eaf0ff}
  /* flat shapes instead of gradients: dithered gradients triple the PNG size */
  .glow,.glow2,.glow3{position:absolute;border-radius:50%}
  .glow{width:780px;height:780px;background:#12305e;opacity:.5;left:-240px;top:-330px}
  .glow2{width:640px;height:640px;background:#0d3f3c;opacity:.42;right:-190px;top:-270px}
  .glow3{width:560px;height:560px;background:#2c1745;opacity:.46;right:40px;bottom:-350px}
  .wrap{position:relative;padding:52px 60px;height:100%;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center}
  .brand{display:flex;align-items:center;gap:12px;font-size:27px;font-weight:700;letter-spacing:.2px}
  .brand i{font-style:normal;font-size:30px}
  .where{font-size:20px;color:#9fb2d4;display:flex;gap:10px;align-items:center}
  h1{font-size:62px;line-height:1.04;font-weight:750;margin-top:34px;letter-spacing:-1.5px;max-width:930px}
  .cities{color:#8fa4c9;font-size:21px;margin-top:12px}
  .total{margin-top:auto;display:flex;align-items:flex-end;gap:24px}
  .total b{font-size:104px;line-height:.92;font-weight:780;letter-spacing:-4px;
    background:linear-gradient(95deg,#7dd3fc,#a5b4fc 55%,#f0abfc);-webkit-background-clip:text;background-clip:text;color:transparent}
  .total span{font-size:23px;color:#9fb2d4;padding-bottom:16px}
  .stats{display:flex;gap:14px;margin-top:30px}
  .stat{flex:1;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:16px 20px}
  .stat em{display:block;font-style:normal;font-size:15px;color:#8fa4c9;letter-spacing:.4px;text-transform:uppercase}
  .stat b{display:block;font-size:31px;margin-top:6px;font-weight:650}
  .foot{display:flex;justify-content:space-between;align-items:center;margin-top:24px;color:#7d8fb3;font-size:17px}
  </style><body><div class="glow"></div><div class="glow2"></div><div class="glow3"></div><div class="wrap">
    <div class="top">
      <div class="brand"><i>🧭</i>NorthCost</div>
      <div class="where">${where}</div>
    </div>
    <h1>${r.name_en}</h1>
    <div class="cities">${(r.cities || []).join(' · ')}</div>
    <div class="total">
      <b>${eur(total)}</b>
      <span>per month, all-in<br>${r.cur === 'EUR' ? 'single person' : '≈ ' + kr(total, r.cur) + ' · single'}</span>
    </div>
    <div class="stats">
      <div class="stat"><em>1-bed rent</em><b>${eur(rent)}</b></div>
      <div class="stat"><em>Groceries</em><b>${eur(food)}</b></div>
      <div class="stat"><em>Monthly pass</em><b>${eur(pass)}</b></div>
      <div class="stat"><em>Utilities</em><b>${eur(r.fatura)}</b></div>
    </div>
    <div class="foot"><span>Rent · groceries · transport · utilities, region by region</span><span>November 2026</span></div>
  </div></body>`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const shoot = (html, name) => {
  const src = path.resolve(TMP, name + '.html');
  fs.writeFileSync(src, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630',
    `--screenshot=${path.resolve(OUT, name + '.png')}`,
    'file:///' + src.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
};

const only = process.env.OG_ONLY?.split(',');
const wants = id => !only || only.includes(id) || only.includes(id.replace(/-sh$/, ''));
let n = 0;
for (const r of REGIONS) {
  // second-hand variants for the two countries with a regulated stock
  if (wants(r.id)) { shoot(card(r), r.id); n++; }
  if (SECONDHAND[r.country] && wants(r.id + '-sh')) { shoot(card(r, 'sh'), r.id + '-sh'); n++; }
}
shoot(card({
  country: null, name_en: 'Cost of living across the Nordics', cities: ['60 regions', 'Finland · Sweden · Norway · Denmark'],
  kira1: 864, market: 400, aylikKart: 700, fatura: 180, profiles: { single: 1900 }, cur: 'EUR', geo: '',
}), 'default');

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`✓ ${n} region cards + 1 default card → ${OUT}/`);
