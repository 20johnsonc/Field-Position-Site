# Field Position — Analytics Dashboard

College football power rankings and matchup slate, built with [Astro](https://astro.build).

## What's in this repo

- `src/pages/index.astro` — main page; loads `rankings.json` and `matchups.json` at build time and pre-renders all matchup cards and rankings rows as static HTML
- `src/data/rankings.json`, `src/data/matchups.json` — sample data. Replace these weekly with fresh exports from your Colab pipeline
- `src/components/PbpChartModal.tsx` — client-side Chart.js island for interactive tug-of-war charts
- `public/pbp/` — play-by-play JSON files fetched on demand when a chart is opened
- `export_data.py` — paste into your Colab notebook to generate updated JSON exports

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:4321`.

## Production build

```bash
npm run build
npm run preview
```

Static output is written to `dist/`.

## Deploying to Cloudflare Pages

1. Connect this repo to Cloudflare Pages
2. **Build command:** `npm run build`
3. **Build output directory:** `dist`
4. Push to trigger a redeploy whenever you update the JSON data files

## Weekly data refresh

1. Re-run your Colab pipeline for the latest week
2. Run the `export_data.py` cell to download `rankings.json` and `matchups.json`
3. Replace `src/data/rankings.json` and `src/data/matchups.json` in this repo
4. Commit and push — Cloudflare rebuilds the static site automatically

The site reads only those two JSON files at build time. As long as their shape stays the same, no code changes are needed when your models change.

## Architecture

| Layer | What runs where |
|---|---|
| Astro frontmatter | Loads and normalizes JSON at build time |
| `.astro` components | Pre-render rankings table and matchup cards |
| `dashboard-controls.ts` | Client script for tabs, filters, and table sorting |
| `PbpChartModal.tsx` (`client:load`) | Interactive Chart.js modal for play-by-play data |
