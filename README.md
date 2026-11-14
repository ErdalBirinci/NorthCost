# NorthCost — Cost of Living Across the Nordics

**NorthCost** is a free, interactive, map-based cost-of-living guide for the Nordics.
Click any region on the map and instantly see what everyday life costs there:
rent, groceries, transport, utilities, salaries, daylight, climate and more —
across **Finland, Sweden, Norway and Denmark (60 regions, 50 cities)**.

🌍 **Live demo:** https://erdalbirinci.github.io/NorthCost/

![NorthCost map overview](docs/screenshots/map-overview.png)

No accounts, no tracking, no paywall. All figures are estimates for
information only, based on official national statistics (November 2026 level).

---

## ✨ Features

### 🗺️ Interactive cost map
- 60 region polygons (FI maakunnat, SE län, NO fylker, DK regioner) with
  heat colors, price bubbles and clustering
- Color the map by **total monthly cost, 1-bed rent, grocery basket,
  transport + utilities, or rent burden (rent ÷ salary)**
- Search any city or region, fly to it, filter by country
- 4 household profiles: **Student · Single · Couple · Family**
- 5 interface languages: **EN · FI · SV · NO · DA**, currency in
  **EUR / USD / local (kr)**

### ⚖️ 4-way region comparison
Compare up to **4 regions — even across countries** — item by item, with
automatic winner highlighting and a plain-language verdict. Every comparison
has a **shareable link** (`?cmp=id1,id2,…`) that re-opens the exact setup.

![4-region comparison](docs/screenshots/compare-modal.png)

### 🏆 Region ranking
Sortable leaderboard of all 60 regions by total cost, rent, salary,
rent burden or December daylight. Click any row to jump to that region.

### 💸 Salary duel
Two cities, two **net** salaries — the simulator subtracts the local
single-person budget from each paycheck and shows where more money stays
in your pocket.

![Salary duel](docs/screenshots/salary-duel.png)

### 🧭 Find-my-match quiz
Answer 3 questions (who you are, what matters most, monthly budget cap)
and get your top-3 regions, scored from the app's living-score model.

### 📈 Rent trend 2023 → 2026
Each region panel shows an indexed rent-trend sparkline built from official
national rent indices:

| Country | Source | Cumulative 2023→2026 |
|---|---|---|
| 🇸🇪 Sweden | SCB hyresstatistik (+4.1 / +5.0 / +4.6 / +3.3 %) | **+18 %** |
| 🇳🇴 Norway | SSB LMU/KPI + Eiendom Norge | **≈ +16 %** |
| 🇩🇰 Denmark | DST huslejeindeks (2021=100 → 111.9) | **≈ +12 %** |
| 🇫🇮 Finland | StatFi rents of dwellings | **+2 % capital / +5 % rest** |

### 🌤️ Live climate & heating hint
Real January averages + current temperature via Open-Meteo, with an extra
heating-budget warning below −3 °C.

### 🧰 …and more
Budget calculator · net-salary guide · commute & student & family guides ·
compare-to-home tool · printable budget report · user price-fix suggestions ·
local job-board links (Platsbanken, NAV Arbeidsplassen, Jobnet, EURES) ·
offline-capable PWA · shareable deep links for everything.

---

## 📊 Data & methodology

- **Price levels:** November 2026 — national Q3 2026 rent statistics, 2026
  transit fares, EU fuel bulletin, ECB November 2026 reference rates.
- **Geometries:** Finland (attez/jsonmaps-finland), Sweden
  (GioPalusa/SwedenGeoJSON), Norway (robhop/fylker-og-kommuner), Denmark
  (Eurostat GISCO NUTS, vendored in `public/geo/`).
- **Basemap tiles:** OpenStreetMap, OpenTopoMap, Esri (Imagery + Dark Gray) —
  all free, **no API key required**. If a tile provider ever starts failing,
  the app automatically detects it and falls back to OSM Standard.
- Salaries are **average net estimates**; figures are rounded estimates,
  not quotes. See *Sources* inside the app for the full list.

---

## 🛠️ Run locally

```sh
npm install
npm run dev      # → http://127.0.0.1:5173/
npm run build    # → dist/
```

No framework, no backend, no secrets. Static files only.

## 📁 Project structure

```
index.html          # page shell + all modals
src/
  main.js           # all app logic (map, panels, tools, URL state)
  data.js           # Finland: 19 regions, cities, currencies, rates
  data_nordic.js    # Sweden/Norway/Denmark: 41 regions + cities
  extra.js          # per-region extras (photos, daylight, transit…)
  i18n.js           # EN/FI/SV/NO/DA strings (no service names in UI)
  style.css / extra.css
public/
  geo/dk-regions.geojson   # vendored Denmark boundaries
  sw.js / manifest.webmanifest / icons/   # PWA
docs/screenshots/   # images used in this README
.github/workflows/deploy.yml  # GitHub Pages deploy
```

## 🚀 Deployment

Pushing to `main` automatically builds and deploys to GitHub Pages
(`https://<user>.github.io/NorthCost/`) via the workflow in
`.github/workflows/deploy.yml`. The Vite `base` is set to `/NorthCost/`
for the project-site subpath.

## 📄 License

MIT — fork it, translate it, make it yours. Attribution appreciated.
