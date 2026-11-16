// NorthCost data layer.
//
// Raw source values live in /data/*.json and are never edited here:
//   data/regions.fi.json    19 Finnish regions, EUR
//   data/regions.nordic.json 41 Swedish/Norwegian/Danish regions, native kr
//   data/cities.json        map pins
//   data/currencies.json    single FX source of truth (ECB, Nov 2026)
//   data/countries.json     per-country cost defaults + map view
//
// Everything that can be computed is computed here, so the JSON only stores
// measurements: outside-centre and 3-bedroom rents (unless a region overrides
// the default ratio), the monthly transport cost, all four household totals,
// and the EUR conversion. scripts/validate-data.mjs re-derives the same values
// and fails the build if anything drifts.
import currencies from '../data/currencies.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import fiRegions from '../data/regions.fi.json' with { type: 'json' };
import nordicRegions from '../data/regions.nordic.json' with { type: 'json' };
import cities from '../data/cities.json' with { type: 'json' };

export const CURRENCIES = currencies;
export const COUNTRY = countries.meta;
export const BASE = countries.base;
export const LANGS = ['en', 'fi', 'sv', 'no', 'da'];

// Transport cost = monthly pass + 15% for occasional single trips.
export const TRANSPORT_FACTOR = 1.15;
export const OUTSIDE_RATIO = 0.72;   // outside-centre vs centre rent
export const THREE_BED_RATIO = 1.7;  // 3-bedroom vs 1-bedroom rent
export const MISC_EUR = 150;         // eating out + personal care in the total

export const r10 = n => Math.round(n / 10) * 10;
const rateOf = cur => CURRENCIES[cur]?.rate ?? 1;

// Derive every computed figure for one region, in its own currency.
export function deriveNative(r) {
  const c = { ...BASE[r.country], ...r.cost };
  const kira1d = c.kira1d ?? r10(c.kira1 * OUTSIDE_RATIO);
  const kira3 = c.kira3 ?? r10(c.kira1 * THREE_BED_RATIO);
  const ulasim = c.ulasim ?? r10(c.aylikKart * TRANSPORT_FACTOR);
  const single = r10(c.kira1 + c.market + ulasim + c.fatura + MISC_EUR * rateOf(r.currency));
  return {
    ...c,
    kira1d, kira3, ulasim, single,
    student: r10(single * 0.6),
    couple: r10(single * 1.38),
    family: r10(single * 2.02),
  };
}

function buildRegion(raw) {
  const rate = rateOf(raw.currency);
  const eur = n => n / rate;
  const n = deriveNative(raw);
  const lang = (obj, key) => Object.fromEntries(LANGS.map(l => [key + '_' + l, obj[l] ?? obj.en]));
  return {
    id: raw.id, country: raw.country, cur: raw.currency,
    fi: raw.fi, geo: raw.geo, geoAlt: raw.geoAlt,
    ...lang(raw.name, 'name'),
    center: raw.center, cities: raw.cities,
    ...lang(raw.blurb, 'blurb'),
    ...lang(raw.tags, 'tags'),
    maas: eur(n.maas),
    kira1: eur(n.kira1), kira1d: eur(n.kira1d), kira3: eur(n.kira3),
    market: eur(n.market), ulasim: eur(n.ulasim), fatura: eur(n.fatura), internet: eur(n.internet),
    benzin: eur(n.benzin), bilet: eur(n.bilet), aylikKart: eur(n.aylikKart), taksi: eur(n.taksi),
    ucuzOgun: eur(n.ucuzOgun), ortaRestoran: eur(n.ortaRestoran), kahve: eur(n.kahve), bira: eur(n.bira),
    sut: eur(n.sut), ekmek: eur(n.ekmek), yumurta12: eur(n.yumurta12), tavukKg: eur(n.tavukKg), elmaKg: eur(n.elmaKg),
    profiles: { student: eur(n.student), single: eur(n.single), couple: eur(n.couple), family: eur(n.family) },
    skor: raw.skor,
  };
}

export const REGIONS = [...fiRegions, ...nordicRegions].map(buildRegion);

export const CITIES = cities.map(c => ({
  name: c.name, regionId: c.regionId, country: c.country, lat: c.lat, lng: c.lng,
  ...Object.fromEntries(LANGS.map(l => ['note_' + l, c.note[l] ?? c.note.en])),
}));

const LOCALES = { en: 'en-US', fi: 'fi-FI', sv: 'sv-SE', no: 'nb-NO', da: 'da-DK' };

// mode: 'eur' | 'usd' | 'local'. cur: the region's ISO code (EUR/SEK/NOK/DKK).
// 'local' shows the region's own currency (falls back to EUR for EUR regions).
export function fmtMoney(v, mode = 'eur', lang = 'en', cur = 'EUR', dec = 0) {
  const loc = LOCALES[lang] || 'en-US';
  let code = 'EUR';
  if (mode === 'usd') code = 'USD';
  else if (mode === 'local' && cur && cur !== 'EUR') code = cur;
  const c = CURRENCIES[code] || CURRENCIES.EUR;
  const num = v * c.rate;
  const n = dec > 0
    ? num.toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: dec })
    : Math.round(num).toLocaleString(loc);
  if (code === 'USD') return lang === 'fi' ? n + ' $' : '$' + n;
  return c.before ? c.sym + n : n + ' ' + c.sym;
}
