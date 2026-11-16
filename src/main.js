import './style.css';
import './extra.css';
import { REGIONS, CITIES, COUNTRY, fmtMoney, CURRENCIES } from './data.js';
import { STR } from './i18n.js';
import { EXT } from './extra.js';

let lang = 'en';
let profile = 'single';
let curMode = 'eur'; // 'eur' | 'usd' | 'local'
let country = 'ALL'; // 'ALL' | 'FI' | 'SE' | 'NO' | 'DK'
let selectedId = 'stockholm';
let metric = 'total';
let map, geoLayer, baseLayer;
let baseIndex = 3;
const T = () => STR[lang];
const byId = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const byGeo = {};
REGIONS.forEach(r => { if (r.fi) byGeo[r.fi] = r; if (r.geo) byGeo[r.geo] = r; if (r.geoAlt) byGeo[r.geoAlt] = r; });
byGeo["Lappi"] = byId["lappi"]; byGeo["Ahvenanmaa"] = byId["ahvenanmaa"];

const X = id => EXT[id] || {};
const FAVKEY = 'flc-favs';
let favs = new Set(JSON.parse(localStorage.getItem(FAVKEY) || '[]'));
const saveFavs = () => localStorage.setItem(FAVKEY, JSON.stringify([...favs]));
let clusterGroup = null;
const rname = r => r['name_' + lang] || r.name_en;
const rshort = r => rname(r).split(' (')[0];
const rblurb = r => r['blurb_' + lang] || r.blurb_en;
const rtags = r => r['tags_' + lang] || r.tags_en;
const cnote = c => c['note_' + lang] || c.note_en;
const pname = () => ({ student: T().pStudent, single: T().pSingle, couple: T().pCouple, family: T().pFamily })[profile];
const M = (v, cur = 'EUR') => fmtMoney(v, curMode, lang, cur);
const Mx = v => fmtMoney(v, curMode === 'local' ? 'eur' : curMode, lang);
const Md = (v, cur = 'EUR', d = 1) => fmtMoney(v, curMode, lang, cur, d);
const natSub = (v, cur, dec = 0) => (cur && cur !== 'EUR' && curMode !== 'local') ? `<br><small class="nat-sub">≈ ${fmtMoney(v, 'local', lang, cur, dec)}</small>` : '';
const natPair = (v1, v2, cur, d1 = 0, d2 = 0) => (cur && cur !== 'EUR' && curMode !== 'local') ? `<br><small class="nat-sub">≈ ${fmtMoney(v1, 'local', lang, cur, d1)} / ${fmtMoney(v2, 'local', lang, cur, d2)}</small>` : '';
const altMoney = (v, cur) => {
  if (curMode === 'eur') return (cur && cur !== 'EUR') ? fmtMoney(v, 'local', lang, cur) : fmtMoney(v, 'usd', lang);
  return fmtMoney(v, 'eur', lang);
};
const visRegions = () => country === 'ALL' ? REGIONS : REGIONS.filter(r => r.country === country);
function minMax() { const v = visRegions().map(metricValue); return [Math.min(...v), Math.max(...v)]; }
// December daylight hours from latitude (winter solstice); null when the sun never rises.
function growthOf(r) {
  if (r.country === 'SE') return 0.18;
  if (r.country === 'NO') return 0.16;
  if (r.country === 'DK') return 0.12;
  return r.id === 'uusimaa' ? 0.02 : 0.05;
}
function trendSeries(r) {
  const g = growthOf(r), y26 = r.kira1, y23 = y26 / (1 + g), out = [];
  for (let i = 0; i < 4; i++) out.push(Math.round(y23 + (y26 - y23) * i / 3));
  return out;
}
function sparkline(vals, w = 132, h = 38) {
  const min = Math.min(...vals), max = Math.max(...vals), rg = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - ((v - min) / rg) * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const JOBS = {
  FI: [{ l: 'Työmarkkinatori', u: 'https://tyomarkkinatori.fi' }, { l: 'EURES EU mobility', u: 'https://eures.europa.eu' }],
  SE: [{ l: 'Platsbanken', u: 'https://arbetsformedlingen.se/platsbanken/' }, { l: 'EURES EU mobility', u: 'https://eures.europa.eu' }],
  NO: [{ l: 'Arbeidsplassen (NAV)', u: 'https://arbeidsplassen.nav.no/stillinger' }, { l: 'EURES EU mobility', u: 'https://eures.europa.eu' }],
  DK: [{ l: 'Jobnet', u: 'https://jobnet.dk' }, { l: 'Jobindex', u: 'https://jobindex.dk/jobsoegning' }],
};
const wxCache = {};
function daylightFromLat(lat) {
  const d = -23.44 * Math.PI / 180, p = lat * Math.PI / 180;
  const c = (Math.sin(-0.83 * Math.PI / 180) - Math.sin(p) * Math.sin(d)) / (Math.cos(p) * Math.cos(d));
  if (c >= 1) return null;
  if (c <= -1) return 24;
  return Math.acos(c) * 2 * 12 / Math.PI;
}

const GEO_SOURCES = [
  { url: "https://raw.githubusercontent.com/attez/jsonmaps-finland/master/geojson/maakunnat_latest.geojson", pick: f => f.properties.nimi || f.properties.name },
  { url: "https://raw.githubusercontent.com/GioPalusa/SwedenGeoJSON/main/La%CC%88n/lan.geojson", pick: f => f.properties.beslutatnamn || f.properties.namnkortform },
  { url: "https://raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Fylker-L.geojson", pick: f => f.properties.name || f.properties.fylkesnavn },
  { url: "geo/dk-regions.geojson", pick: f => f.properties.NUTS_NAME },
];
function styleFor(r, min, max) {
  if (!r || (country !== 'ALL' && r.country !== country)) return { color: '#ffffff', weight: 1.2, fillColor: '#9aa3b2', fillOpacity: 0.22 };
  return { color: '#ffffff', weight: 1.2, fillColor: colorFor(metricValue(r), min, max), fillOpacity: 0.62 };
}

// Fully free basemaps, no API key required
const BASEMAPS = [
  { label_en: '🗺️ Standard', label_fi: '🗺️ Vakio', label_sv: '🗺️ Standard', label_no: '🗺️ Standard', label_da: '🗺️ Standard', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19, dark: false },
  { label_en: '⛰️ Topo', label_fi: '⛰️ Topo', label_sv: '⛰️ Topo', label_no: '⛰️ Topo', label_da: '⛰️ Topo', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17, dark: false },
  { label_en: '🛰️ Satellite', label_fi: '🛰️ Satelliitti', label_sv: '🛰️ Satellit', label_no: '🛰️ Satellitt', label_da: '🛰️ Satellit', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics', maxZoom: 19, dark: false },
  { label_en: '🌙 Dark', label_fi: '🌙 Tumma', label_sv: '🌙 Mörk', label_no: '🌙 Mørk', label_da: '🌙 Mørk', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Esri, TomTom, Garmin, FAO, NOAA, USGS', maxZoom: 19, dark: false },
];
// Providers that failed to load tiles (e.g. started requiring an API key) are
// skipped automatically and the map falls back to OSM Standard.
const deadProviders = new Set();
function makeBaseLayer() {
  const b = BASEMAPS[baseIndex];
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(b.url, { attribution: b.attr, maxZoom: b.maxZoom });
  let errs = 0;
  baseLayer.on('tileerror', () => {
    if (++errs > 12 && baseIndex !== 0 && !deadProviders.has(baseIndex)) {
      deadProviders.add(baseIndex);
      baseIndex = 0;
      makeBaseLayer();
      const btn = document.getElementById('basemapBtn');
      if (btn) btn.textContent = blabel(BASEMAPS[0]);
    }
  });
  baseLayer.on('load', () => { errs = 0; });
  baseLayer.addTo(map);
}
const blabel = b => b['label_' + lang] || b.label_en;

const pct1 = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const metricFmt = (v, cur = 'EUR') => metric === 'afford' ? pct1(v) : M(v, cur);
function metricValue(r) {
  if (metric === 'afford') return r.kira1 / r.maas;
  if (metric === 'kira') return r.kira1;
  if (metric === 'market') return r.market;
  if (metric === 'ulasim') return r.ulasim + r.fatura;
  return r.profiles[profile];
}
function metricLabel() {
  const t = T();
  if (metric === 'afford') return t.mAfford;
  if (metric === 'kira') return t.mRent;
  if (metric === 'market') return t.mMarket;
  if (metric === 'ulasim') return t.mTrans;
  return t.mTotal;
}
function colorFor(v, min, max) {
  const x = (v - min) / Math.max(1, max - min);
  if (x < 0.2) return '#34d399';
  if (x < 0.4) return '#a3e635';
  if (x < 0.6) return '#fbbf24';
  if (x < 0.8) return '#fb923c';
  return '#fb7185';
}
function pillClass(v, min, max) {
  const x = (v - min) / Math.max(1, max - min);
  if (x < 0.4) return 'cheap'; if (x < 0.7) return 'mid'; return 'exp';
}

function initMap() {
  map = L.map('map', { scrollWheelZoom: true }).setView([65.2, 26.5], 5);
  makeBaseLayer();
  loadRegions();
  refreshMarkers();
}

async function loadRegions() {
  const layers = [];
  for (const src of GEO_SOURCES) {
    try {
      const res = await fetch(src.url);
      const gj = await res.json();
      (gj.features || []).forEach(f => { f._pick = src.pick(f); });
      layers.push(gj);
    } catch {}
  }
  if (!layers.length) {
    const mh = document.getElementById('mapHint');
    if (mh) { mh.hidden = false; mh.textContent = T().hint + ' (offline? borders unavailable)'; }
    return;
  }
  const [min, max] = minMax();
  geoLayer = L.geoJSON(layers, {
    style: f => styleFor(byGeo[f._pick], min, max),
    onEachFeature: (f, layer) => {
      const r = byGeo[f._pick];
      if (!r) return;
      layer.bindTooltip(`<b>${rname(r)}</b><br>${metricLabel()}: <b>${metricFmt(metricValue(r), r.cur)}</b><br><small>${T().tipClick}</small>`, { className: 'region-tip', sticky: true });
      layer.on('mouseover', () => layer.setStyle({ weight: 3, fillOpacity: 0.8 }));
      layer.on('mouseout', () => geoLayer.resetStyle(layer));
      layer.on('click', () => selectRegion(r.id, true));
    }
  }).addTo(map);
  try { map.fitBounds(geoLayer.getBounds(), { padding: [10, 10] }); } catch {}
  refreshLegend();
}

function refreshMarkers() {
  if (clusterGroup) { map.removeLayer(clusterGroup); clusterGroup = null; }
  else map.eachLayer(l => { if (l instanceof L.Marker) map.removeLayer(l); });
  const useCluster = typeof L.markerClusterGroup === 'function';
  if (useCluster) clusterGroup = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42 });
  const [min, max] = minMax();
  CITIES.forEach(c => {
    const r = byId[c.regionId];
    if (!r || (country !== 'ALL' && r.country !== country)) return;
    const v = r.profiles[profile];
    const pill = metric === 'afford' ? pct1(metricValue(r)) : M(v, r.cur);
    const icon = L.divIcon({ className: '', html: `<div class="price-pill ${pillClass(metricValue(r), min, max)}">${c.name} • ${pill}</div>`, iconSize: null });
    const m = L.marker([c.lat, c.lng], { icon });
    m.bindTooltip(`<b>${c.name}</b> — ${rname(r)}<br>${cnote(c)}<br>${metric === 'afford' ? metricLabel() : T().tipSingle} <b>${metric === 'afford' ? pct1(metricValue(r)) : M(v, r.cur)}</b>`, { className: 'region-tip' });
    m.on('click', () => selectRegion(c.regionId, false));
    if (clusterGroup) clusterGroup.addLayer(m); else m.addTo(map);
  });
  if (clusterGroup) map.addLayer(clusterGroup);
}

function refreshLegend() {
  const [min, max] = minMax();
  document.getElementById('legendTitle').textContent = metric === 'afford' ? T().mAfford : T().legendTotal(pname());
  document.getElementById('legMin').textContent = metric === 'afford' ? pct1(min) : Mx(min);
  document.getElementById('legMax').textContent = metric === 'afford' ? pct1(max) : Mx(max);
  if (geoLayer) geoLayer.setStyle(f => styleFor(byGeo[f._pick], min, max));
}

function selectRegion(id, fly) {
  selectedId = id;
  const r = byId[id];
  if (fly) map.flyTo(r.center, 7, { duration: 1.1 });
  renderPanel(); syncURL();
}

function bar(label, value, max, cur = 'EUR') {
  const pct = Math.round((value / max) * 100);
  return `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><b>${M(value, cur)}</b></div>`;
}

function renderPanel() {
  const t = T();
  const r = byId[selectedId];
  const el = document.getElementById('detailPanel');
  const total = r.profiles[profile];
  const _vis = visRegions();
  const avg = Math.round(_vis.reduce((a, x) => a + x.profiles[profile], 0) / _vis.length);
  const diff = Math.round(((total - avg) / avg) * 100);
  const kiraPay = Math.round((r.kira1 / total) * 100);
  const x = X(selectedId);
  const fav = favs.has(selectedId);
  const pct = Math.round((r.kira1 / r.maas) * 100);
  const band = pct <= 30 ? t.affordGood : pct <= 40 ? t.affordMid : t.affordBad;
  const circ = 2 * Math.PI * 26;
  el.innerHTML = `
    <button class="sheet-handle" id="sheetHandle">··· ${t.sheetUp}</button>
    ${x.img ? `<div class="photo photo-hero"><img src="${x.img}" alt="${rname(r)}" loading="lazy" /><div class="photo-grad"></div><div class="photo-total"><small>${pname()} • ${t.inclRent}</small><b>${M(total, r.cur)}</b><span>≈ ${(r.cur !== 'EUR' && curMode !== 'local') ? fmtMoney(total, 'local', lang, r.cur) : altMoney(total, r.cur)}</span></div><a href="${x.src || 'https://commons.wikimedia.org'}" target="_blank" rel="noopener">${t.photoCredit}</a></div>` : ''}
    <div class="panel-hero"><div class="flag">📍</div>
      <div><h2>${rname(r)}</h2><div class="sub">${r.fi || r.geo} • ${r.cities.join(' • ')} • ${t.avgSalary} ${M(r.maas, r.cur)}${r.cur !== 'EUR' ? ` <span class="cur-chip">${r.cur}</span>` : ''}</div></div>
      ${consent.fav ? `<button class="fav-star" id="favStar" aria-label="${t.favT}">${fav ? '★' : '☆'}</button>` : ''}
    </div>
    <p style="color:var(--muted);font-size:14px;margin:0 0 6px">${rblurb(r)}</p>
    <div class="tag-row">${rtags(r).map(x => `<span>${x}</span>`).join('')}</div>
    <div class="big-total">
      <div><small>${pname()} • ${t.inclRent}</small><b>${M(total, r.cur)}</b><small>≈ ${altMoney(total, r.cur)} • ${t.vsAvg(diff)}</small></div>
      <div class="big-total-right">
        <svg class="donut" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="donut-bg"/><circle cx="32" cy="32" r="26" class="donut-fg" stroke-dasharray="${(kiraPay / 100 * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" class="donut-t">${kiraPay}%</text></svg>
        <div class="trend ${diff > 8 ? 'high' : ''}">${diff >= 0 ? '🔥' : '💚'} ${diff >= 0 ? '+' : ''}${diff}%</div>
      </div>
    </div>
    <div class="gauge-wrap">
      <div class="gauge-top"><span>🏠 ${M(r.kira1, r.cur)} / ${M(r.maas, r.cur)}</span><b>${pct}% · ${band}</b></div>
      <div class="gauge"><div class="gauge-fill" style="width:${Math.min(100, pct / 0.6)}%"></div><div class="gauge-rule" style="left:50%"></div></div>
      <div class="gauge-lbls"><span>0%</span><span>30%</span><span>60%</span></div>
    </div>
    <div class="compare-note">${t.affordT(pct, band)}</div>
    <div class="section-title">${t.expenses}</div>
    <div class="bars">
      ${bar(t.eRent, r.kira1, 2000, r.cur)}
      ${bar(t.eMarket, r.market, 550, r.cur)}
      ${bar(t.eTrans, r.ulasim, 160, r.cur)}
      ${bar(t.eUtil, r.fatura, 400, r.cur)}
      ${bar(t.eEat, 140, 260, r.cur)}
    </div>
    <div class="compare-note">${t.rentNote(kiraPay, (r.kira1 / r.maas * 100).toFixed(0))}</div>
    <div class="section-title">${t.scores}</div>
    <div class="score-grid">
      <div class="score"><b>${r.skor.is}</b><small>${t.sWork}</small></div>
      <div class="score"><b>${r.skor.ogrenci}</b><small>${t.sStudy}</small></div>
      <div class="score"><b>${r.skor.doga}</b><small>${t.sNature}</small></div>
      <div class="score"><b>${r.skor.ulasim}</b><small>${t.sTrans}</small></div>
    </div>
    <div class="section-title">${t.daylightT}</div>
    <div class="daylight">
      ${(() => { const dl = X(selectedId).daylight ?? daylightFromLat(r.center[0]); return dl == null ? `<div class="daylight-note">❄️ ${t.polarNight}</div>` : `<div class="daylight-note">☀️ ${dl.toFixed(1)} h</div><div class="daylight-bar"><i style="width:${(dl / 7 * 100).toFixed(0)}%"></i></div>`; })()}
      ${x.rentTrend != null ? `<span class="trend-chip">${t.trendRents(x.rentTrend)}</span>` : ''}
    </div>
    <div class="section-title">${t.trendTitle}</div>
    <div class="trendbox">${sparkline(trendSeries(r))}<div class="trend-vals"><span>2023 ${M(trendSeries(r)[0], r.cur)}</span><b>2026 ${M(trendSeries(r)[3], r.cur)} (+${Math.round(growthOf(r) * 100)}%)</b></div></div>
    <div class="section-title">${t.wxT}</div>
    <div class="wx" id="wxBox">…</div>
    <div class="section-title">${t.detail}</div>
    <table class="detail-table">
      <tr><td>${t.d1}</td><td>${M(r.kira1, r.cur)}${t.perMonth}${natSub(r.kira1, r.cur)}</td></tr>
      <tr><td>${t.d1b}</td><td>${M(r.kira1d, r.cur)}${t.perMonth}${natSub(r.kira1d, r.cur)}</td></tr>
      <tr><td>${t.d3}</td><td>${M(r.kira3, r.cur)}${t.perMonth}${natSub(r.kira3, r.cur)}</td></tr>
      <tr><td>${t.dUtil}</td><td>${M(r.fatura, r.cur)}${t.perMonth}${natSub(r.fatura, r.cur)}</td></tr>
      <tr><td>${t.dNet}</td><td>${M(r.internet, r.cur)}${t.perMonth}${natSub(r.internet, r.cur)}</td></tr>
      <tr><td>${t.dTicket}</td><td>${Md(r.bilet, r.cur)} / ${M(r.aylikKart, r.cur)}${natPair(r.bilet, r.aylikKart, r.cur)}</td></tr>
      <tr><td>${t.dFuel}</td><td>${Md(r.benzin, r.cur, 2)} / ${Md(r.taksi, r.cur)}${natPair(r.benzin, r.taksi, r.cur, 1, 1)}</td></tr>
      <tr><td>${t.dRest}</td><td>${M(r.ucuzOgun, r.cur)} / ${M(r.ortaRestoran, r.cur)}${natPair(r.ucuzOgun, r.ortaRestoran, r.cur)}</td></tr>
      <tr><td>${t.dCafe}</td><td>${Md(r.kahve, r.cur)} / ${M(r.bira, r.cur)}${natPair(r.kahve, r.bira, r.cur)}</td></tr>
      <tr><td>${t.dMilk}</td><td>${Md(r.sut, r.cur)} / ${Md(r.ekmek, r.cur)}${natPair(r.sut, r.ekmek, r.cur)}</td></tr>
      <tr><td>${t.dEgg}</td><td>${M(r.yumurta12, r.cur)} / ${M(r.tavukKg, r.cur)}${natPair(r.yumurta12, r.tavukKg, r.cur)}</td></tr>
      <tr><td>${t.dApple}</td><td>${Md(r.elmaKg, r.cur)}${natSub(r.elmaKg, r.cur)}</td></tr>
    </table>
    <div class="section-title">${t.citiesIn}</div>
    <div class="city-chips">${r.cities.map(c => `<button data-city="${c}">${c}</button>`).join('')}</div>
    <div class="section-title">${t.jobsT}</div>
    <div class="job-row">${(JOBS[r.country] || []).map(j => `<a href="${j.u}" target="_blank" rel="noopener">💼 ${j.l} ↗</a>`).join('')}</div>
    <div class="compare-note">⚖️ ${t.cmpNote}</div>
  `;
  const starBtn = el.querySelector('#favStar');
  if (starBtn) starBtn.onclick = () => {
    favs.has(selectedId) ? favs.delete(selectedId) : favs.add(selectedId);
    saveFavs(); renderPanel(); renderFavDrawer();
  };
  el.querySelectorAll('[data-city]').forEach(b => b.addEventListener('click', () => {
    const city = CITIES.find(c => c.name === b.dataset.city);
    if (city) map.flyTo([city.lat, city.lng], 9, { duration: 1 });
    document.getElementById('searchInput').value = b.dataset.city;
  }));
  loadWx(r);
}
async function loadWx(r) {
  const box = document.getElementById('wxBox');
  if (!box) return;
  const t = T();
  try {
    if (!wxCache[r.id]) {
      const [lat, lon] = [r.center[0].toFixed(2), r.center[1].toFixed(2)];
      const [a, b] = await Promise.all([
        fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2026-01-01&end_date=2026-01-31&daily=temperature_2m_mean&timezone=auto`).then(x => x.json()),
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`).then(x => x.json()),
      ]);
      const jan = a?.daily?.temperature_2m_mean?.filter(v => v != null);
      wxCache[r.id] = { jan: jan?.length ? jan.reduce((s, v) => s + v, 0) / jan.length : null, now: b?.current?.temperature_2m ?? null };
    }
    const w = wxCache[r.id];
    if (w.jan == null && w.now == null) { box.style.display = 'none'; return; }
    box.innerHTML = `${w.now != null ? `🌡️ ${t.wxNow} <b>${w.now.toFixed(1)}°C</b>` : ''}${w.jan != null ? ` · ${t.wxJan} <b>${w.jan.toFixed(1)}°C</b>` : ''}${w.jan != null && w.jan < -3 ? `<br><small>❄️ ${t.heatCold}</small>` : ''}`;
  } catch { box.style.display = 'none'; }
}

function renderStats() {
  const t = T();
  const vals = [...visRegions()].sort((a, b) => a.profiles[profile] - b.profiles[profile]);
  const cheap = vals[0], exp = vals[vals.length - 1];
  const avg = Math.round(vals.reduce((a, x) => a + x.profiles[profile], 0) / vals.length);
  document.getElementById('statsStrip').innerHTML = `
    <div class="stat-chip">${t.cheapest} <b>${rshort(cheap)}</b> ${M(cheap.profiles[profile], cheap.cur)}</div>
    <div class="stat-chip">${t.priciest} <b>${rshort(exp)}</b> ${M(exp.profiles[profile], exp.cur)}</div>
    <div class="stat-chip">${t.avg(pname())} <b>${Mx(avg)}</b></div>
    <div class="stat-chip">${t.rentVs2(rshort(exp), rshort(cheap), (exp.kira1 / cheap.kira1).toFixed(1))}</div>
  `;
}

function applyStatic() {
  const t = T();
  document.documentElement.lang = lang;
  document.title = t.title;
  document.querySelector('meta[name="description"]').setAttribute('content', t.metaDesc);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t[el.dataset.i18n];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t[el.dataset.i18nPh]; });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { const v = t[el.dataset.i18nHtml]; if (typeof v === 'string') el.innerHTML = v; });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t[el.dataset.i18nTitle]; });
  document.getElementById('basemapBtn').textContent = blabel(BASEMAPS[baseIndex]);
  const setOpt = (key, v) => { const o = document.querySelector(`[data-i18n="${key}"]`); if (o) o.textContent = v; };
  setOpt('bRegions', t.bRegions(REGIONS.length));
  setOpt('bCities', t.bCities(CITIES.length));
  setOpt('eat2', t.eat2(Mx(120)));
  setOpt('eat3', t.eat3(Mx(280)));
  setOpt('car2', t.car2(Mx(240)));
  setOpt('salGross', t.salGross(salCode()));
  setOpt('homeRent', t.homeRent(homeCode()));
  setOpt('homeTotal', t.homeTotal(homeCode()));
  document.querySelectorAll('.sim-net-lbl').forEach(o => o.textContent = t.simNet(homeCode()));
  buildCountryOptions(document.getElementById('countrySelect'), country);
  updCurBtn();
  const sf = document.getElementById('srcFineP');
  if (sf) sf.textContent = (byId[selectedId] && byId[selectedId].country === 'FI') ? t.srcFine : t.srcFine2;
}
function salCode() {
  if (curMode === 'usd') return 'USD';
  if (curMode === 'local') { const s = document.getElementById('salRegion'); const r = byId[(s && s.value) || selectedId]; return (r && r.cur) || 'EUR'; }
  return 'EUR';
}
function homeCode() { return curMode === 'usd' ? 'USD' : 'EUR'; }
function updCurBtn() {
  const b = document.getElementById('currencyBtn');
  b.textContent = curMode === 'eur' ? '€ EUR' : curMode === 'usd' ? '$ USD' : '¤ LOCAL';
  b.title = T().curT;
}
function buildCountryOptions(sel, val) {
  if (!sel) return;
  const t = T();
  sel.innerHTML = [['ALL', t.cAll], ['FI', t.cFI], ['SE', t.cSE], ['NO', t.cNO], ['DK', t.cDK]].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.value = val;
}

/* ---------- EU consent (GDPR/ePrivacy) ---------- */
const CONSENT_V = 1;
let consent = { fonts: false, fav: true };
function loadConsent() {
  try {
    const c = JSON.parse(localStorage.getItem('flc-consent') || 'null');
    if (c && c.v === CONSENT_V) { consent.fonts = !!c.fonts; consent.fav = c.fav !== false; return true; }
  } catch {}
  return false;
}
function saveConsent() {
  localStorage.setItem('flc-consent', JSON.stringify({ v: CONSENT_V, fonts: consent.fonts, fav: consent.fav }));
  applyConsent();
}
function applyConsent() {
  if (consent.fonts) loadFonts();
  if (!consent.fav && favs.size) { favs.clear(); saveFavs(); }
}
function loadFonts() {
  if (document.getElementById('gfonts')) return;
  const l = document.createElement('link');
  l.id = 'gfonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
function initConsent() {
  const has = loadConsent();
  applyConsent();
  renderPanel();
  const banner = document.getElementById('consentBanner');
  document.getElementById('consFonts').checked = consent.fonts;
  document.getElementById('consFav').checked = consent.fav;
  if (!has) banner.classList.remove('hidden');
  document.getElementById('consAll').onclick = () => { consent.fonts = true; consent.fav = true; saveConsent(); banner.classList.add('hidden'); renderFavDrawer(); renderPanel(); };
  document.getElementById('consSave').onclick = () => { consent.fonts = document.getElementById('consFonts').checked; consent.fav = document.getElementById('consFav').checked; saveConsent(); banner.classList.add('hidden'); renderFavDrawer(); renderPanel(); };
  document.getElementById('cookieBtn').onclick = () => { document.getElementById('consFonts').checked = consent.fonts; document.getElementById('consFav').checked = consent.fav; banner.classList.remove('hidden'); };
  document.getElementById('legalBtn').onclick = () => document.getElementById('legalModal').classList.remove('hidden');
}
/* ---------- keyboard region jump ---------- */
function initJump() {
  const sel = document.getElementById('jumpSelect');
  sel._build = () => { sel.innerHTML = visRegions().map(r => `<option value="${r.id}">${rname(r)}</option>`).join(''); sel.value = selectedId; };
  sel._build();
  sel.onchange = () => { selectRegion(sel.value, true); const h = document.querySelector('#detailPanel h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } };
}
/* ---------- modal a11y: roles, focus, Esc, trap ---------- */
function initModalA11y() {
  const dlg = [...document.querySelectorAll('.modal,.drawer')];
  dlg.forEach(m => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); });
  let lastFocus = null;
  const obs = new MutationObserver(muts => {
    muts.forEach(mu => {
      const el = mu.target;
      if (!el.classList || el.classList.contains('hidden')) { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); return; }
      lastFocus = document.activeElement;
      const f = el.querySelector('[data-close],button');
      if (f) setTimeout(() => f.focus(), 30);
    });
  });
  dlg.forEach(m => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      dlg.forEach(m => m.classList.add('hidden'));
      document.getElementById('toolsMenu').classList.add('hidden');
    }
    if (e.key === 'Tab') {
      const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop() || (!document.getElementById('favDrawer').classList.contains('hidden') ? document.getElementById('favDrawer') : null);
      if (!open) return;
      const f = [...open.querySelectorAll('button,select,input,a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });
}
function initSearch() {
  const input = document.getElementById('searchInput');
  const box = document.getElementById('searchResults');
  input.addEventListener('input', () => {
    const q = input.value.toLocaleLowerCase().trim();
    if (q.length < 2) { box.classList.add('hidden'); return; }
    const hits = [
      ...CITIES.map(c => ({ label: `${c.name} — ${rname(byId[c.regionId])}`, id: c.regionId, lat: c.lat, lng: c.lng })),
      ...REGIONS.map(r => ({ label: `📍 ${rname(r)}`, id: r.id, lat: r.center[0], lng: r.center[1] }))
    ].filter(h => h.label.toLocaleLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.map((h, i) => `<button data-i="${i}">${h.label}</button>`).join('') || `<button disabled>${T().noResult}</button>`;
    box.classList.remove('hidden');
    box.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => {
      const h = hits[+b.dataset.i];
      selectRegion(h.id, false);
      map.flyTo([h.lat, h.lng], 8, { duration: 1 });
      box.classList.add('hidden'); input.value = h.label.split(' — ')[0].replace('📍 ', '');
    }));
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.classList.add('hidden'); });
}

function buildRegionOptions(sel, val) {
  sel.innerHTML = REGIONS.map(r => `<option value="${r.id}">${rname(r)}</option>`).join('');
  sel.value = val;
}

function initCompare() {
  const modal = document.getElementById('compareModal');
  const a = document.getElementById('cmpA'), b = document.getElementById('cmpB'), c = document.getElementById('cmpC'), d = document.getElementById('cmpD');
  const blank = `<option value="">—</option>`;
  buildRegionOptions(a, 'uusimaa'); buildRegionOptions(b, 'pirkanmaa');
  c.innerHTML = blank + REGIONS.map(r => `<option value="${r.id}">${rname(r)}</option>`).join('');
  d.innerHTML = blank + REGIONS.map(r => `<option value="${r.id}">${rname(r)}</option>`).join('');
  const render = () => {
    const t = T();
    const Rs = [a, b, c, d].map(s => byId[s.value]).filter(Boolean);
    const rows = [
      [t.cmpTotal(pname()), r => r.profiles[profile], true],
      [t.cmpRent, r => r.kira1, true],
      [t.cmpMarket, r => r.market, true],
      [t.cmpUtil, r => r.ulasim + r.fatura, true],
      [t.cmpSalary, r => r.maas, false],
    ];
    const head = `<div class="cmp-table-head"><span></span>` + Rs.map(r => `<b>${rshort(r)}</b>`).join('') + `</div>`;
    document.getElementById('cmpResult').innerHTML = head + rows.map(([l, fn, lowWin]) => {
      const vs = Rs.map(fn);
      const best = lowWin ? Math.min(...vs) : Math.max(...vs);
      return `<div class="cmp-table-row"><small>${l}</small>` + Rs.map((r, i) => `<span class="${vs[i] === best ? 'cmp-winner' : ''}"><b>${Mx(vs[i])}</b>${vs[i] === best ? ' ✓' : ''}${natSub(vs[i], Rs[i].cur)}</span>`).join('') + `</div>`;
    }).join('') + (() => {
      const sorted = [...Rs].sort((x, y) => x.profiles[profile] - y.profiles[profile]);
      const cheap = sorted[0], exp = sorted[sorted.length - 1];
      return `<div class="compare-note">💡 ${t.cmpVerdict(rshort(exp), rshort(cheap), Mx(Math.abs(exp.profiles[profile] - cheap.profiles[profile])), rshort(cheap))}</div>`;
    })();
  };
  [a, b, c, d].forEach(s => s.onchange = render);
  document.getElementById('compareBtn').onclick = () => { a.value = selectedId; render(); modal.classList.remove('hidden'); };
  modal.querySelector('[data-close]').onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  document.getElementById('cmpLink').onclick = async () => {
    const u = new URL(location.href);
    u.searchParams.set('cmp', [a, b, c, d].map(s => s.value).filter(Boolean).join(','));
    try { await navigator.clipboard.writeText(u.toString()); document.getElementById('cmpLink').textContent = '✓'; } catch { location.hash = u.hash; }
    setTimeout(() => document.getElementById('cmpLink').textContent = T().cmpLink, 1200);
  };
  modal._render = render; modal._a = a; modal._b = b; modal._c = c; modal._d = d;
  try {
    const cp = new URLSearchParams(location.search).get('cmp');
    if (cp) {
      const ids = cp.split(',').filter(id => byId[id]);
      if (ids.length >= 2) { [a, b, c, d].forEach((s, i) => { s.value = ids[i] || ''; }); render(); modal.classList.remove('hidden'); }
    }
  } catch {}
}

function initCalc() {
  const modal = document.getElementById('calcModal');
  const sel = document.getElementById('calcRegion');
  buildRegionOptions(sel, selectedId);
  const render = () => {
    const t = T();
    const r = byId[sel.value];
    const base = r.profiles[profile];
    const homeF = parseFloat(document.getElementById('calcHome').value);
    const eat = parseFloat(document.getElementById('calcEat').value);
    const car = parseFloat(document.getElementById('calcCar').value);
    const kiraScaled = r.kira1 * homeF;
    const total = Math.round((base - r.kira1 + kiraScaled) + eat + car);
    document.getElementById('calcEat').options[1].textContent = t.eat2(M(120, r.cur));
    document.getElementById('calcEat').options[2].textContent = t.eat3(M(280, r.cur));
    document.getElementById('calcCar').options[1].textContent = t.car2(M(240, r.cur));
    document.getElementById('calcResult').innerHTML = t.calcRes(
      rname(r), pname(), M(total, r.cur), altMoney(total, r.cur), M(kiraScaled, r.cur), M(total - kiraScaled, r.cur), M(eat, r.cur), M(car, r.cur), curMode);
  };
  ['calcHome', 'calcEat', 'calcCar'].forEach(id => document.getElementById(id).onchange = render);
  sel.onchange = render;
  document.getElementById('calcBtn').onclick = () => { sel.value = selectedId; render(); modal.classList.remove('hidden'); };
  modal.querySelector('[data-close]').onclick = () => modal.classList.add('hidden');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  modal._render = render; modal._sel = sel;
}

// ---------- deep links ----------
function syncURL() {
  const p = new URLSearchParams({ region: selectedId, profile, lang, metric, country, cur: curMode });
  history.replaceState(null, '', location.pathname + '?' + p.toString());
}
function applyFromURL() {
  const p = new URLSearchParams(location.search);
  const rg = p.get('region'); if (rg && byId[rg]) selectedId = rg;
  const pf = p.get('profile'); if (pf && ['student','single','couple','family'].includes(pf)) {
    profile = pf;
    document.querySelectorAll('#profileSegment button').forEach(x => x.classList.toggle('active', x.dataset.profile === pf));
  }
  const lg = p.get('lang'); if (lg && LANGS.includes(lg)) { lang = lg; document.getElementById('langBtn').textContent = lang.toUpperCase(); }
  const mt = p.get('metric'); if (mt && ['total','kira','market','ulasim','afford'].includes(mt)) { metric = mt; document.getElementById('metricSelect').value = mt; }
  const cy = p.get('country'); if (cy && ['ALL','FI','SE','NO','DK'].includes(cy)) country = cy;
  const cu = p.get('cur'); if (cu && ['eur','usd','local'].includes(cu)) curMode = cu;
}

// ---------- favorites ----------
function renderFavDrawer() {
  const t = T();
  const box = document.getElementById('favList');
  if (!consent.fav) { box.innerHTML = `<p class="empty-note">${t.favDisabled}</p>`; return; }
  if (!favs.size) { box.innerHTML = `<p class="empty-note">${t.favEmpty}</p>`; return; }
  box.innerHTML = [...favs].map(id => {
    const r = byId[id]; if (!r) return '';
    return `<div class="fav-row"><span><b>${rshort(r)}</b><br>${t.citiesIn2}: ${r.cities.join(', ')}<br>${t.rentShort}: ${M(r.kira1, r.cur)} · ${t.salShort}: ${M(r.maas, r.cur)}</span><span><b>${M(r.profiles[profile], r.cur)}</b><br><button data-unfav="${id}">✕</button></span></div>`;
  }).join('');
  box.querySelectorAll('[data-unfav]').forEach(b => b.onclick = () => { favs.delete(b.dataset.unfav); saveFavs(); renderFavDrawer(); renderPanel(); });
  box.querySelectorAll('.fav-row').forEach((row, i) => row.firstElementChild.style.cursor = 'pointer');
}
function openFav() { renderFavDrawer(); document.getElementById('favDrawer').classList.remove('hidden'); }

// ---------- tools ----------
function effRate(g) {
  const pts = [[1500,12],[2000,17],[2500,21.5],[3000,25.5],[3500,28.5],[4000,31],[5000,34.5],[7000,38],[10000,41]];
  if (g <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (g <= pts[i][0]) { const [g0,r0] = pts[i-1], [g1,r1] = pts[i]; return r0 + (r1-r0)*(g-g0)/(g1-g0); }
  }
  return 42;
}
function havKm(a, b) {
  const R = 6371, dLa = (b[0]-a[0])*Math.PI/180, dLo = (b[1]-a[1])*Math.PI/180;
  const s = Math.sin(dLa/2)**2 + Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
function cityOptions(sel, val) {
  sel.innerHTML = CITIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  sel.value = val;
}
let rankKey = 'total', rankDir = 1;
function renderRank() {
  const t = T();
  const rows = [...visRegions()].map(r => ({ r, total: r.profiles[profile], rent: r.kira1, salary: r.maas, burden: r.kira1 / r.maas, day: X(r.id).daylight ?? daylightFromLat(r.center[0]) ?? -1 }));
  rows.sort((x, y) => (x[rankKey] - y[rankKey]) * rankDir);
  const th = (k, label) => `<th data-k="${k}">${label}${rankKey === k ? (rankDir === 1 ? ' ▲' : ' ▼') : ''}</th>`;
  const box = document.getElementById('rankResult');
  box.innerHTML = `<table class="home-table rank-table"><tr><th>${t.cRegion}</th>${th('total', t.rkTotal)}${th('rent', t.cmpRent)}${th('salary', t.cmpSalary)}${th('burden', t.rkBurden)}${th('day', t.rkDay)}</tr>` +
    rows.map(({ r, total, rent, salary, burden, day }, i) => `<tr data-id="${r.id}"><td><b>#${i + 1}</b> ${rname(r)}</td><td>${Mx(total)}${natSub(total, r.cur)}</td><td>${Mx(rent)}${natSub(rent, r.cur)}</td><td>${Mx(salary)}${natSub(salary, r.cur)}</td><td>${pct1(burden)}</td><td>${day < 0 ? '—' : '☀ ' + day.toFixed(1) + 'h'}</td></tr>`).join('') + `</table>`;
  box.querySelectorAll('th[data-k]').forEach(h => h.onclick = () => { const k = h.dataset.k; if (rankKey === k) rankDir *= -1; else { rankKey = k; rankDir = 1; } renderRank(); });
  box.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { document.getElementById('rankModal').classList.add('hidden'); selectRegion(tr.dataset.id, true); });
}
function openRank() { renderRank(); document.getElementById('rankModal').classList.remove('hidden'); }
function quizBuildOptions() {
  const t = T();
  const set = (id, opts) => { const s = document.getElementById(id); const v = s.value; s.innerHTML = opts.map(([val, l]) => `<option value="${val}">${l}</option>`).join(''); if ([...s.options].some(o => o.value === v)) s.value = v; };
  set('quizWho', [['student', t.pStudent], ['single', t.pSingle], ['couple', t.pCouple], ['family', t.pFamily]]);
  set('quizWant', [['work', t.sWork], ['study', t.sStudy], ['nature', t.sNature], ['cheap', t.wantCheap]]);
  set('quizBudget', [['any', t.qAny], ['2200', '≤ ' + Mx(2200)], ['2800', '≤ ' + Mx(2800)], ['3400', '≤ ' + Mx(3400)], ['4200', '≤ ' + Mx(4200)]]);
}
function quizRender() {
  const t = T();
  const who = document.getElementById('quizWho').value || 'single';
  const want = document.getElementById('quizWant').value || 'cheap';
  const budget = document.getElementById('quizBudget').value || 'any';
  if (profile !== who) {
    profile = who;
    document.querySelectorAll('#profileSegment button').forEach(x => x.classList.toggle('active', x.dataset.profile === who));
    renderStats(); refreshLegend(); refreshMarkers(); syncURL();
  }
  const key = { work: 'is', study: 'ogrenci', nature: 'doga' }[want];
  let pool = [...visRegions()];
  if (budget !== 'any') pool = pool.filter(r => r.profiles[who] <= +budget);
  const top = pool.map(r => {
    const s = r.skor, base = (s.is + s.ogrenci + s.doga + s.ulasim) / 4;
    return { r, score: want === 'cheap' ? -r.profiles[who] : s[key] * 0.65 + base * 0.35 };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
  const box = document.getElementById('quizResult');
  box.innerHTML = `<div class="section-title">${t.quizTop}</div>` + top.map(({ r }, i) => `<button class="quiz-hit" data-id="${r.id}"><b>${['🥇', '🥈', '🥉'][i]} ${rname(r)}</b><small>${Mx(r.profiles[who])} · ${t.rentShort} ${M(r.kira1, r.cur)}</small></button>`).join('');
  box.querySelectorAll('.quiz-hit').forEach(b => b.onclick = () => { document.getElementById('quizModal').classList.add('hidden'); selectRegion(b.dataset.id, true); });
}
function fixBuildItems() {
  const t = T();
  const s = document.getElementById('fixItem'); const v = s.value;
  s.innerHTML = [['rent', t.mRent], ['salary', t.avgSalary], ['other', t.fixOther]].map(([val, l]) => `<option value="${val}">${l}</option>`).join('');
  if (['rent', 'salary', 'other'].includes(v)) s.value = v;
}
function initFix() {
  buildRegionOptions(document.getElementById('fixRegion'), selectedId);
  fixBuildItems();
  document.getElementById('fixSend').onclick = () => {
    const t = T();
    const r = byId[document.getElementById('fixRegion').value];
    const item = document.getElementById('fixItem').value;
    const val = document.getElementById('fixValueIn').value;
    const note = document.getElementById('fixNoteIn').value;
    try { const arr = JSON.parse(localStorage.getItem('ncFixes') || '[]'); arr.push({ r: r.id, item, val, note, at: Date.now() }); localStorage.setItem('ncFixes', JSON.stringify(arr)); } catch {}
    location.href = `mailto:hello@northcost.example?subject=${encodeURIComponent(`NorthCost price fix: ${rshort(r)} — ${item} = ${val}`)}&body=${encodeURIComponent(`Region: ${rname(r)} (${r.id})\nField: ${item}\nValue: ${val}\nNote: ${note}\nLang: ${lang}`)}`;
    const th = document.getElementById('fixThanks'); th.textContent = t.fixThanks; th.hidden = false;
  };
}
function buildCityOptions(sel, val) {
  sel.innerHTML = CITIES.map(c => `<option value="${c.name}">${c.name} (${rshort(byId[c.regionId])})</option>`).join('');
  sel.value = val;
}
function simRender() {
  const t = T();
  const code = homeCode();
  document.querySelectorAll('.sim-net-lbl').forEach(o => o.textContent = t.simNet(code));
  const pick = id => { const c = CITIES.find(x => x.name === document.getElementById(id).value); return c && byId[c.regionId]; };
  const A = pick('simCityA') || byId[selectedId], B = pick('simCityB') || byId[selectedId];
  const raw = id => Math.max(0, parseFloat(document.getElementById(id).value) || 0);
  const conv = v => code === 'USD' ? v / CURR.USD.rate : v;
  const la = Math.round(conv(raw('simNetA')) - A.profiles.single), lb = Math.round(conv(raw('simNetB')) - B.profiles.single);
  const win = la === lb ? -1 : (la > lb ? 0 : 1);
  const row = (city, r, l, w) => `<div class="cmp-row ${w ? 'cmp-winner' : ''}"><span>${city}<br><b>${Mx(l < 0 ? 0 : l)}</b>${w ? ' ✓' : ''}</span><small>${rname(r)}</small><span style="text-align:right">${t.cmpTotal(t.pSingle)}<br><b>${Mx(r.profiles.single)}</b></span></div>`;
  document.getElementById('simResult').innerHTML = row(document.getElementById('simCityA').value, A, la, win === 0) + row(document.getElementById('simCityB').value, B, lb, win === 1) +
    (win >= 0 ? `<div class="compare-note">${t.simWin(win === 0 ? document.getElementById('simCityA').value : document.getElementById('simCityB').value, Mx(Math.abs(la - lb)))}</div>` : '');
}
function initTools() {
  const t0 = T();
  // dropdown
  const menu = document.getElementById('toolsMenu');
  document.getElementById('toolsBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); };
  document.addEventListener('click', () => menu.classList.add('hidden'));
  const openModal = id => { menu.classList.add('hidden'); document.getElementById(id).classList.remove('hidden'); };
  menu.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
    const map = { salary:'salaryModal', commute:'commuteModal', student:'studentModal', family:'familyModal', home:'homeModal', sources:'sourcesModal', sim:'simModal', quiz:'quizModal', fix:'fixModal', fav:null };
    map[b.dataset.tool] === null ? openFav() : openModal(map[b.dataset.tool]);
  });
  document.getElementById('rankBtn').onclick = () => openRank();
  document.getElementById('printBtn').onclick = () => window.print();
  document.getElementById('shareBtn').onclick = e => {
    syncURL();
    navigator.clipboard?.writeText(location.href).catch(()=>{});
    const old = e.target.textContent; e.target.textContent = T().copied;
    setTimeout(() => e.target.textContent = old, 1600);
  };
  document.getElementById('srcBadge').onclick = () => openModal('sourcesModal');
  document.querySelector('[data-close-fav]').onclick = () => document.getElementById('favDrawer').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => {
    if (!m._render) { m.querySelector('[data-close]').onclick = () => m.classList.add('hidden'); m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }); }
  });
  document.getElementById('detailPanel').addEventListener('click', e => {
    if (e.target.closest('#sheetHandle')) document.getElementById('detailPanel').classList.toggle('collapsed');
  });
  // salary
  const sSel = document.getElementById('salRegion');
  const salRender = () => {
    const t = T();
    const r = byId[sSel.value] || byId[selectedId];
    const inp = Math.max(0, parseFloat(document.getElementById('salGross').value) || 0);
    const g = curMode === 'usd' ? inp / CURRENCIES.USD.rate : curMode === 'local' ? inp / (CURRENCIES[r.cur] || CURRENCIES.EUR).rate : inp;
    const net = Math.round(g * (1 - effRate(g) / 100));
    const left = net - r.profiles[profile];
    const np = document.getElementById('salNoteP');
    if (np) np.textContent = r.country === 'FI' ? t.salNote : t.salNote2;
    document.querySelector('[data-i18n="salGross"]').textContent = t.salGross(salCode());
    document.getElementById('salResult').innerHTML = t.salRes(M(net, r.cur), (left >= 0 ? '+' : '') + M(left, r.cur).replace('-','−').replace('−-','−'), rname(r), pname());
  };
  buildRegionOptions(sSel, selectedId);
  document.getElementById('salGross').oninput = salRender; sSel.onchange = salRender;
  // commute
  const ch = document.getElementById('comHome'), cw = document.getElementById('comWork');
  const comRender = () => {
    const t = T();
    const A = CITIES.find(c => c.name === ch.value), B = CITIES.find(c => c.name === cw.value);
    const km = Math.round(havKm([A.lat, A.lng], [B.lat, B.lng]));
    const mode = document.getElementById('comMode').value;
    const days = parseInt(document.getElementById('comDays').value);
    const rate = { train: 0.28, bus: 0.22, car: 0.45 }[mode];
    const speed = { train: 110, bus: 70, car: 80 }[mode];
    const cost = Math.round(km * 2 * days * 4.33 * rate);
    const mins = Math.round(km * 2 / speed * 60);
    const cpp = document.getElementById('comPp');
    if (cpp) cpp.textContent = t.comP2;
    document.getElementById('comResult').innerHTML = t.comRes(km, Mx(cost), mins);
  };
  cityOptions(ch, 'Lahti'); cityOptions(cw, 'Helsinki');
  [ch, cw].forEach(s => s.onchange = comRender);
  document.getElementById('comMode').onchange = comRender;
  document.getElementById('comDays').onchange = comRender;
  // student
  const stuRender = () => {
    const t = T();
    const rows = [
      ['Helsinki', 'HOAS', 350, 650], ['Tampere', 'TOAS', 300, 550],
      ['Stockholm', 'SSSB', 500, 850], ['Uppsala', 'Uppsala Bostad', 450, 700],
      ['Oslo', 'SiO', 550, 900], ['Trondheim', 'SiT', 500, 800],
      ['Copenhagen', 'KKIK', 600, 950], ['Aarhus', 'A. Ungdomsbolig', 500, 800],
    ].map(([city, org, lo, hi]) => {
      const c = CITIES.find(x => x.name === city);
      const r = byId[c.regionId];
      return `<tr><td><b>${city}</b> (${org})<br><small>${Mx(lo)}–${Mx(hi)}</small></td><td>${M(r.profiles.student, r.cur)}</td><td>${M(r.kira1, r.cur)}</td><td>${r.skor.ogrenci}</td></tr>`;
    }).join('');
    const sr = byId[selectedId];
    const mealBase = { FI: 3, SE: 3.5, NO: 4, DK: 4 }[sr.country] || 3.5;
    const spp = document.getElementById('stuPp');
    if (spp) spp.textContent = sr.country === 'FI' ? t.stuP : t.stuP2;
    document.getElementById('stuBody').innerHTML =
      `<div class="compare-note">🍽️ ${sr.country === 'FI' ? t.stuMeal(M(mealBase, 'EUR')) : t.stuMealV(M(mealBase, sr.cur))} · 🏠 ${t.stuHouse}</div>
       <div class="section-title">${t.stuShow}</div>
       <table class="home-table"><tr><th></th><th>${pname()}</th><th>1-bed</th><th>🎓</th></tr>${rows}</table>`;
  };
  // family
  const famRender = () => {
    const t = T();
    const kids = parseInt(document.getElementById('famKids').value);
    const day = Math.min(kids, parseInt(document.getElementById('famDay').value));
    const fees = [311, 124, 62, 62].slice(0, day).reduce((a, b) => a + b, 0);
    const ben = kids * 100;
    const net = fees - ben;
    const r = byId[selectedId];
    const fnp = document.getElementById('famNoteP');
    if (fnp) fnp.textContent = r.country === 'FI' ? t.famNote : t.famNote2;
    document.getElementById('famResult').innerHTML = t.famRes(M(fees, r.cur), M(ben, r.cur), (net >= 0 ? '+' : '−') + M(Math.abs(net), r.cur).replace('-','')) +
      `<br><small style="color:var(--muted)">${rname(r)} 👨‍👩‍👧 ≈ ${M(r.profiles.family + net, r.cur)}</small>`;
  };
  ['famKids','famDay'].forEach(id => document.getElementById(id).onchange = famRender);
  // compare-to-home
  const homeRender = () => {
    const t = T();
    const city = document.getElementById('homeCity').value || '—';
    const inp = Math.max(0, parseFloat(document.getElementById('homeTotal').value) || 0);
    const ht = curMode === 'usd' ? inp / CURRENCIES.USD.rate : inp;
    document.querySelector('[data-i18n="homeRent"]').textContent = t.homeRent(homeCode());
    document.querySelector('[data-i18n="homeTotal"]').textContent = t.homeTotal(homeCode());
    const rows = [...visRegions()].map(r => ({ r, d: r.profiles.single - ht })).sort((a, b) => a.d - b.d);
    document.getElementById('homeResult').innerHTML =
      `<table class="home-table"><tr><th>${city}</th><th>Single</th><th>Δ</th></tr>` +
      rows.map(({ r, d }) => `<tr><td>${rname(r)}</td><td>${Mx(r.profiles.single)}</td><td class="${Math.abs(d) < ht*0.03 ? 'diff-same' : d < 0 ? 'diff-cheap' : 'diff-exp'}">${d >= 0 ? '+' : '−'}${Mx(Math.abs(d)).replace('-','')} ${Math.abs(d) < ht*0.03 ? t.homeSame : d < 0 ? t.homeCheaper : t.homePricier}</td></tr>`).join('') + `</table>`;
  };
  ['homeCity','homeRent','homeTotal'].forEach(id => document.getElementById(id).oninput = homeRender);
  // openers refresh content
  document.querySelector('[data-tool="salary"]').addEventListener('click', () => { buildRegionOptions(sSel, selectedId); salRender(); }, true);
  document.querySelector('[data-tool="commute"]').addEventListener('click', comRender, true);
  document.querySelector('[data-tool="student"]').addEventListener('click', stuRender, true);
  document.querySelector('[data-tool="family"]').addEventListener('click', famRender, true);
  document.querySelector('[data-tool="home"]').addEventListener('click', homeRender, true);
  buildCityOptions(document.getElementById('simCityA'), 'Stockholm');
  buildCityOptions(document.getElementById('simCityB'), 'Oslo');
  ['simCityA','simNetA','simCityB','simNetB'].forEach(id => document.getElementById(id).oninput = simRender);
  document.querySelector('[data-tool="sim"]').addEventListener('click', simRender, true);
  document.querySelector('[data-tool="quiz"]').addEventListener('click', () => { quizBuildOptions(); if (document.getElementById('quizResult').innerHTML) quizRender(); }, true);
  document.getElementById('quizGo').onclick = quizRender;
  document.querySelector('[data-tool="fix"]').addEventListener('click', () => { buildRegionOptions(document.getElementById('fixRegion'), selectedId); fixBuildItems(); }, true);
  initFix();
  // expose for lang switch
  window._toolRerender = () => {
    buildRegionOptions(sSel, sSel.value);
    [['salaryModal',salRender],['commuteModal',comRender],['studentModal',stuRender],['familyModal',famRender],['homeModal',homeRender],['simModal',simRender]].forEach(([id, fn]) => {
      const m = document.getElementById(id);
      if (!m.classList.contains('hidden')) fn();
    });
    quizBuildOptions(); fixBuildItems();
    if (!document.getElementById('rankModal').classList.contains('hidden')) renderRank();
    const qm = document.getElementById('quizModal');
    if (!qm.classList.contains('hidden') && document.getElementById('quizResult').innerHTML) quizRender();
    renderFavDrawer();
  };
}

document.getElementById('profileSegment').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  document.querySelectorAll('#profileSegment button').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  profile = btn.dataset.profile;
  renderStats(); renderPanel(); refreshLegend(); refreshMarkers(); syncURL();
});
document.getElementById('currencyBtn').onclick = () => {
  curMode = curMode === 'eur' ? 'usd' : curMode === 'usd' ? 'local' : 'eur';
  applyStatic();
  renderStats(); renderPanel(); refreshLegend(); refreshMarkers();
  document.getElementById('rateNote').textContent = T().rate;
  if (window._toolRerender) window._toolRerender();
  syncURL();
};
document.getElementById('countrySelect').onchange = e => {
  country = e.target.value;
  if (!visRegions().find(r => r.id === selectedId)) selectedId = visRegions()[0].id;
  if (country !== 'ALL') { const c = COUNTRY[country]; map.flyTo([c.center[0], c.center[1]], c.zoom, { duration: 1 }); }
  refreshLegend(); refreshMarkers(); renderStats(); renderPanel();
  const js = document.getElementById('jumpSelect'); if (js && js._build) js._build();
  syncURL();
};
const LANGS = ['en', 'fi', 'sv', 'no', 'da'];
document.getElementById('langBtn').onclick = e => {
  lang = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  e.target.textContent = lang.toUpperCase();
  applyStatic();
  renderStats(); renderPanel(); refreshLegend(); refreshMarkers();
  const cm = document.getElementById('compareModal');
  buildRegionOptions(cm._a, cm._a.value); buildRegionOptions(cm._b, cm._b.value);
  [cm._c, cm._d].forEach(s => { const v = s.value; s.innerHTML = `<option value="">—</option>` + REGIONS.map(r => `<option value="${r.id}">${rname(r)}</option>`).join(''); s.value = [...s.options].some(o => o.value === v) ? v : ''; });
  if (!cm.classList.contains('hidden')) cm._render();
  const lm = document.getElementById('calcModal');
  buildRegionOptions(lm._sel, lm._sel.value);
  if (!lm.classList.contains('hidden')) lm._render();
  if (window._toolRerender) window._toolRerender();
  const js = document.getElementById('jumpSelect'); if (js && js._build) js._build();
  syncURL();
};
document.getElementById('basemapBtn').onclick = e => {
  for (let i = 0; i < BASEMAPS.length; i++) {
    baseIndex = (baseIndex + 1) % BASEMAPS.length;
    if (!deadProviders.has(baseIndex)) break;
  }
  makeBaseLayer();
  const b = BASEMAPS[baseIndex];
  try { baseLayer.getContainer().style.filter = b.dark ? 'invert(1) hue-rotate(180deg) brightness(.92) contrast(.92) saturate(.7)' : ''; } catch {}
  e.target.textContent = blabel(b);
};
document.getElementById('metricSelect').onchange = e => { metric = e.target.value; refreshLegend(); syncURL(); };

applyStatic();
applyFromURL();
applyStatic();
initMap(); renderPanel(); renderStats(); initSearch(); initCompare(); initCalc(); initTools(); initJump(); initModalA11y(); initConsent(); renderFavDrawer(); syncURL();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
