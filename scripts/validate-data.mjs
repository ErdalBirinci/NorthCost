// Validates /data before every build. Exits non-zero on the first broken rule,
// because a silent data error is worse than a failed deploy.
//
//   node scripts/validate-data.mjs
//
import fs from 'node:fs';
// NOTE on independence: the loader (src/data.js) must never vouch for its own
// arithmetic, so deriveNative is deliberately NOT imported here. All expected
// values below are recomputed from the raw JSON with formulas written out in
// this file, plus hardcoded spot-check fixtures.
// Only the loader's OUTPUT (REGIONS/CITIES) is imported. Every input — the
// raw JSON, the rates, the expected economics — comes from independent
// sources in this file, so the loader can never vouch for its own arithmetic.
import { REGIONS, CITIES } from '../src/data.js';
import currenciesRaw from '../data/currencies.json' with { type: 'json' };
import countriesRaw from '../data/countries.json' with { type: 'json' };
const CURRENCIES = currenciesRaw;
const BASE = countriesRaw.base;
const LANGS = ['en', 'fi', 'sv', 'no', 'da'];

// The loader's own constants are deliberately NOT imported: the expected
// economics are pinned here, so changing a ratio in src/data.js fails the
// build instead of silently moving every figure.
const TRANSPORT_FACTOR = 1.15;
const OUTSIDE_RATIO = 0.72;
const THREE_BED_RATIO = 1.7;
const MISC_EUR = 150;

const errors = [];
const fail = (m) => errors.push(m);
const read = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));

const fiRaw = read('regions.fi.json');
const noRaw = read('regions.nordic.json');
const citiesRaw = read('cities.json');


const CURRENCY_OF = { FI: 'EUR', SE: 'SEK', NO: 'NOK', DK: 'DKK' };
const REQUIRED_COST = ['kira1', 'market', 'fatura', 'internet', 'benzin', 'bilet', 'aylikKart',
  'taksi', 'ucuzOgun', 'ortaRestoran', 'kahve', 'bira', 'sut', 'ekmek', 'yumurta12', 'tavukKg',
  'elmaKg', 'maas'];
const SKOR_KEYS = ['is', 'ogrenci', 'doga', 'ulasim'];
const TURKISH = /[ğışİĞŞ]/;

// ---------- currencies ----------
if (CURRENCIES.EUR?.rate !== 1) fail('currencies: EUR rate must be 1');
for (const [code, c] of Object.entries(CURRENCIES)) {
  if (!(c.rate > 0)) fail(`currencies: ${code} has a non-positive rate`);
  if (!c.sym) fail(`currencies: ${code} has no symbol`);
}

// ---------- second-hand rent factors (the contract/2nd-hand switch) ----------
const SH = countriesRaw.secondhand;
if (!SH || typeof SH !== 'object') fail('countries: secondhand map missing');
else {
  for (const [cc, f] of Object.entries(SH)) {
    if (!CURRENCY_OF[cc]) fail(`secondhand: unknown country ${cc}`);
    if (!(typeof f === 'number' && f > 1 && f <= 2)) fail(`secondhand: ${cc} factor ${f} out of (1, 2]`);
  }
  if (SH.SE !== 1.5) fail('secondhand: SE factor must be 1.5 (andrahand 40-60%)');
  if (SH.DK !== 1.3) fail('secondhand: DK factor must be 1.3 (fremleje 20-40%)');
}

// ---------- move-in cash rules (deposit + prepaid, in months of rent) ----------
const MV = countriesRaw.movein;
if (!MV || typeof MV !== 'object') fail('countries: movein map missing');
else {
  for (const [cc, m] of Object.entries(MV)) {
    if (!CURRENCY_OF[cc]) fail(`movein: unknown country ${cc}`);
    if (!(typeof m?.deposit === 'number' && m.deposit >= 0 && m.deposit <= 6)) fail(`movein: ${cc} deposit out of 0-6`);
    if (!(typeof m?.prepaid === 'number' && m.prepaid >= 0 && m.prepaid <= 3)) fail(`movein: ${cc} prepaid out of 0-3`);
    if (m.depositSecondhand != null && !(m.depositSecondhand >= 0 && m.depositSecondhand <= 3)) {
      fail(`movein: ${cc} depositSecondhand out of 0-3`);
    }
  }
  const eq = (cc, d, p, ds) => MV[cc]?.deposit === d && MV[cc]?.prepaid === p && (MV[cc]?.depositSecondhand ?? null) === ds;
  if (!eq('FI', 2, 0, null)) fail('movein: FI must be deposit 2 + prepaid 0 (usual; legal max 3)');
  if (!eq('SE', 0, 0, 1)) fail('movein: SE must be deposit 0 / 1 second-hand + prepaid 0');
  if (!eq('NO', 3, 0, null)) fail('movein: NO must be deposit 3 + prepaid 0 (usual; legal max 6)');
  if (!eq('DK', 3, 3, null)) fail('movein: DK must be deposit 3 + prepaid 3 (both capped)');
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

// ---------- golden fixtures: hand-derived, visible in the source ----------
// A change to any ratio or constant in the loader breaks these loudly, with
// the expected native-currency number right there in the failure message.
const round10 = n => Math.round(n / 10) * 10;
const near = (a, b) => Math.abs(a - b) <= 1e-6;
const GOLDEN = [
  // stockholm: 9600 + 5000 + r10(1060*1.15)=1220 + 2410 + 150*11.1075=1666.125 → 19900
  { id: 'stockholm', rate: 11.1075, single: 19900, kira1d: 6910, kira3: 16320 },
  // oslo: 19000 + 5390 + r10(495*1.15)=570 + 2700 + 150*10.5695=1585.425 → 29250
  { id: 'oslo', rate: 10.5695, single: 29250, kira1d: 15580, kira3: 30140 },
  // uusimaa: 1100 + 380 + r10(74*1.15)=90 + 131 + 150 → 1850
  { id: 'uusimaa', rate: 1, single: 1850, kira1d: 790, kira3: 1870 },
];
for (const g of GOLDEN) {
  const r = REGIONS.find(x => x.id === g.id);
  if (!r) { fail(`golden ${g.id}: region vanished`); continue; }
  if (!near(r.profiles.single * g.rate, g.single)) {
    fail(`golden ${g.id}: single is ${Math.round(r.profiles.single * g.rate)}, expected ${g.single}`);
  }
  if (!near(r.kira1d * g.rate, g.kira1d)) fail(`golden ${g.id}: outside-centre rent changed`);
  if (!near(r.kira3 * g.rate, g.kira3)) fail(`golden ${g.id}: 3-bedroom rent changed`);
}
// second-hand premium math, pinned end to end: Stockholm's effective total is
// the contract total plus half the contract rent (SE factor 1.5)
{
  const r = REGIONS.find(x => x.id === 'stockholm');
  const f = countriesRaw.secondhand?.SE;
  const expected = 19900 + 9600 * (1.5 - 1); // 24700 kr
  if (r && f && !near((r.profiles.single + r.kira1 * (f - 1)) * CURRENCIES.SEK.rate, expected)) {
    fail('secondhand: Stockholm effective total changed — check the premium math');
  }
}
// move-in cash, pinned end to end in native currency (deposit + prepaid + first month)
{
  const cash = (id, sh) => {
    const raw = all.find(x => x.id === id);
    const m = countriesRaw.movein[raw.country];
    const f = sh ? countriesRaw.secondhand[raw.country] ?? 1 : 1; // deposit scales with the displayed rent
    const depM = sh ? (m.depositSecondhand ?? m.deposit) : m.deposit;
    return raw.cost.kira1 * f * (depM + (m.prepaid ?? 0) + 1);
  };
  const cases = [
    ['hovedstaden', false, 14850 * 7],   // DK: 3 deposit + 3 prepaid + first month
    ['oslo', false, 19000 * 4],          // NO: 3 deposit + first month
    ['uusimaa', false, 1100 * 3],        // FI: 2 deposit + first month
    ['stockholm', false, 9600 * 1],      // SE contract: first-hand needs no deposit
    ['stockholm', true, 14400 * 2],      // SE second-hand: 1 deposit on the sh rent
  ];
  for (const [id, sh, expected] of cases) {
    if (cash(id, sh) !== expected) fail(`movein: ${id}${sh ? ' (second-hand)' : ''} cash changed — check the deposit rules`);
  }
}

// ---------- derived figures: recomputed from raw JSON ----------
// The JSON must hold measurements only: anything the loader can compute may
// not be stored (redundant overrides are rejected, real overrides live
// outside the derivation bands), so there is nothing to drift.
const byId = Object.fromEntries(all.map(x => [x.id, x]));
for (const r of REGIONS) {
  const raw = byId[r.id];
  if (raw.cost?.ulasim != null) fail(`region ${r.id}: ulasim must be derived, not stored`);
  if (raw.profiles != null) fail(`region ${r.id}: profiles must be derived, not stored`);
  for (const [key, ratio] of [['kira1d', OUTSIDE_RATIO], ['kira3', THREE_BED_RATIO]]) {
    const v = raw.cost?.[key];
    if (v != null && Math.abs(v / raw.cost.kira1 - ratio) < 0.02) {
      fail(`region ${r.id}: stored ${key} equals the ${ratio}x default — delete it, it is derived`);
    }
  }

  const rate = CURRENCIES[r.cur].rate;
  const c = { ...BASE[r.country], ...raw.cost };
  const ulasim = round10(c.aylikKart * TRANSPORT_FACTOR);
  const kira1d = c.kira1d ?? round10(c.kira1 * OUTSIDE_RATIO);
  const kira3 = c.kira3 ?? round10(c.kira1 * THREE_BED_RATIO);
  const single = round10(c.kira1 + c.market + ulasim + c.fatura + MISC_EUR * rate);
  if (!near(r.ulasim * rate, ulasim)) fail(`region ${r.id}: transport is not the pass x ${TRANSPORT_FACTOR}`);
  if (!near(r.kira1d * rate, kira1d)) fail(`region ${r.id}: outside-centre rent drifted from default`);
  if (!near(r.kira3 * rate, kira3)) fail(`region ${r.id}: 3-bedroom rent drifted from default`);
  if (!near(r.profiles.single * rate, single)) fail(`region ${r.id}: total drifted from its components`);
  if (!near(r.profiles.student * rate, round10(single * 0.6))) fail(`region ${r.id}: student total drifted`);
  if (!near(r.profiles.couple * rate, round10(single * 1.38))) fail(`region ${r.id}: couple total drifted`);
  if (!near(r.profiles.family * rate, round10(single * 2.02))) fail(`region ${r.id}: family total drifted`);

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
