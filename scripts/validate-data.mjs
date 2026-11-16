// Validates /data before every build. Exits non-zero on the first broken rule,
// because a silent data error is worse than a failed deploy.
//
//   node scripts/validate-data.mjs
//
import fs from 'node:fs';
import { REGIONS, CITIES, CURRENCIES, LANGS, deriveNative, BASE,
  TRANSPORT_FACTOR, OUTSIDE_RATIO, THREE_BED_RATIO } from '../src/data.js';

const errors = [];
const fail = (m) => errors.push(m);
const read = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));

const fiRaw = read('regions.fi.json');
const noRaw = read('regions.nordic.json');
const citiesRaw = read('cities.json');
const currencies = read('currencies.json');

const CURRENCY_OF = { FI: 'EUR', SE: 'SEK', NO: 'NOK', DK: 'DKK' };
const REQUIRED_COST = ['kira1', 'market', 'fatura', 'internet', 'benzin', 'bilet', 'aylikKart',
  'taksi', 'ucuzOgun', 'ortaRestoran', 'kahve', 'bira', 'sut', 'ekmek', 'yumurta12', 'tavukKg',
  'elmaKg', 'maas'];
const SKOR_KEYS = ['is', 'ogrenci', 'doga', 'ulasim'];
const TURKISH = /[ğışİĞŞ]/;

// ---------- currencies ----------
if (currencies.EUR?.rate !== 1) fail('currencies: EUR rate must be 1');
for (const [code, c] of Object.entries(currencies)) {
  if (!(c.rate > 0)) fail(`currencies: ${code} has a non-positive rate`);
  if (!c.sym) fail(`currencies: ${code} has no symbol`);
}

// ---------- regions ----------
const all = [...fiRaw, ...noRaw];
if (all.length !== 60) fail(`regions: expected 60, found ${all.length}`);
if (fiRaw.length !== 19) fail(`regions.fi: expected 19, found ${fiRaw.length}`);
if (noRaw.length !== 41) fail(`regions.nordic: expected 41, found ${noRaw.length}`);

const seen = new Set();
for (const r of all) {
  const where = `region ${r.id}`;
  if (seen.has(r.id)) fail(`${where}: duplicate id`);
  seen.add(r.id);
  if (!CURRENCY_OF[r.country]) fail(`${where}: unknown country ${r.country}`);
  else if (r.currency !== CURRENCY_OF[r.country]) {
    fail(`${where}: currency ${r.currency} does not match ${r.country}`);
  }
  if (!r.center || r.center.length !== 2) fail(`${where}: missing centre point`);

  // regions only store what differs from their country defaults
  const eff = { ...BASE[r.country], ...r.cost };
  for (const k of REQUIRED_COST) {
    const v = eff[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}: ${k} missing or not a number`);
    else if (v <= 0) fail(`${where}: ${k} must be positive`);
  }

  // rent ladder: outside < centre < 3-bed, with documented default ratios
  const c = r.cost ?? {};
  if (c.kira1d != null) {
    const q = c.kira1d / c.kira1;
    if (q < 0.6 || q > 0.95) fail(`${where}: outside-centre rent is ${(q * 100).toFixed(0)}% of centre`);
  }
  if (c.kira3 != null) {
    const q = c.kira3 / c.kira1;
    if (q < 1.3 || q > 2.4) fail(`${where}: 3-bedroom rent is ${q.toFixed(2)}x the 1-bedroom rent`);
  }

  // copy must exist in all five languages
  for (const l of LANGS) {
    if (!r.blurb?.[l]) fail(`${where}: blurb.${l} missing`);
    const tags = r.tags?.[l];
    if (!Array.isArray(tags) || tags.length < 2 || tags.length > 4) {
      fail(`${where}: tags.${l} must have 2-4 items`);
    } else if (tags.some(t => typeof t !== 'string' || !t.trim())) {
      fail(`${where}: tags.${l} has an empty entry`);
    }
    if (!r.name?.[l]) fail(`${where}: name.${l} missing`);
  }

  // the project is English/Finnish/Swedish/Norwegian/Danish only
  const copy = JSON.stringify([r.blurb, r.tags, r.name]);
  if (TURKISH.test(copy)) fail(`${where}: Turkish characters in copy`);

  // living scores
  const keys = Object.keys(r.skor ?? {});
  if (keys.length !== SKOR_KEYS.length || SKOR_KEYS.some(k => !keys.includes(k))) {
    fail(`${where}: skor must have exactly ${SKOR_KEYS.join('/')}`);
  }
  for (const [k, v] of Object.entries(r.skor ?? {})) {
    if (!Number.isInteger(v) || v < 0 || v > 100) fail(`${where}: skor.${k} out of 0-100`);
  }
}

// ---------- derived figures must match a fresh derivation ----------
for (const r of REGIONS) {
  const raw = all.find(x => x.id === r.id);
  const n = deriveNative(raw);
  const rate = CURRENCIES[r.cur].rate;
  const near = (a, b) => Math.abs(a - b) <= 1e-6;
  if (!near(r.profiles.single * rate, n.single)) fail(`region ${r.id}: total drifted from its components`);
  if (!near(r.ulasim * rate, Math.round(n.aylikKart * TRANSPORT_FACTOR / 10) * 10)) {
    fail(`region ${r.id}: transport is not the pass x ${TRANSPORT_FACTOR}`);
  }
  if (!near(r.kira1d * rate, n.kira1d)) fail(`region ${r.id}: outside-centre rent drifted`);
  if (!near(r.kira3 * rate, n.kira3)) fail(`region ${r.id}: 3-bedroom rent drifted`);

  const p = r.profiles;
  if (!(p.student < p.single && p.single < p.couple && p.couple < p.family)) {
    fail(`region ${r.id}: household totals are not increasing`);
  }
  if (r.kira1d >= r.kira1 || r.kira3 <= r.kira1) fail(`region ${r.id}: rent ladder is inverted`);
  if (r.ulasim / r.aylikKart < 1.05 || r.ulasim / r.aylikKart > 1.3) {
    fail(`region ${r.id}: transport/pass ratio out of range`);
  }
}

// ---------- cross-region plausibility ----------
for (const country of Object.keys(CURRENCY_OF)) {
  const list = REGIONS.filter(r => r.country === country).map(r => r.profiles.single);
  if (!list.length) { fail(`country ${country}: no regions`); continue; }
  const spread = Math.max(...list) / Math.min(...list);
  if (spread > 3) fail(`country ${country}: household totals span ${spread.toFixed(1)}x — check the data`);
}

// ---------- cities ----------
if (CITIES.length !== 50) fail(`cities: expected 50, found ${CITIES.length}`);
const ids = new Set(all.map(r => r.id));
for (const c of citiesRaw) {
  if (!ids.has(c.regionId)) fail(`city ${c.name}: unknown regionId ${c.regionId}`);
  if (!(c.lat > 54 && c.lat < 71.5)) fail(`city ${c.name}: latitude ${c.lat} outside the Nordics`);
  if (!(c.lng > 4 && c.lng < 32)) fail(`city ${c.name}: longitude ${c.lng} outside the Nordics`);
  for (const l of LANGS) if (!c.note?.[l]) fail(`city ${c.name}: note.${l} missing`);
}

// ---------- project rules ----------
const FORBIDDEN = /numbeo/i;
const files = ['README.md', ...fs.readdirSync(new URL('../src', import.meta.url)).map(f => 'src/' + f),
  ...fs.readdirSync(new URL('../data', import.meta.url)).map(f => 'data/' + f)];
for (const f of files) {
  const text = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  if (FORBIDDEN.test(text)) fail(`${f}: contains a forbidden source reference`);
}

// ---------- report ----------
if (errors.length) {
  console.error(`\n✗ data validation failed (${errors.length}):`);
  for (const e of errors.slice(0, 40)) console.error('  • ' + e);
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
  process.exit(1);
}
const langCount = all.length * LANGS.length;
console.log(`✓ data ok — ${all.length} regions, ${CITIES.length} cities, ${langCount} blurbs/tagsets, ` +
  `${Object.keys(CURRENCIES).length} currencies, ratios ${OUTSIDE_RATIO}/${THREE_BED_RATIO}/${TRANSPORT_FACTOR}`);
