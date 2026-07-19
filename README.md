# Field Position — deployment walkthrough

## What's in this folder
- `site/index.html` — the whole website (rankings table + matchup cards), one file, no build step.
- `site/rankings.json`, `site/matchups.json` — sample data so the site renders immediately. Replace these weekly with real exports.
- `pipeline/export_data.py` — a cell to paste into your existing Colab notebook that writes fresh `rankings.json` / `matchups.json` from your live `rankings_df`, `predict_matchup`, `lines_lookup`, `overunder_lookup`.

Try it locally first: `cd site && python -m http.server 8000`, then open `localhost:8000`. (Opening `index.html` directly by double-clicking won't work — browsers block `fetch()` on local files without a server.)

---

## 1. Put the site in a GitHub repo
1. Create a free GitHub account if you don't have one.
2. Create a new repository (e.g. `field-position`), public or private — either works with Cloudflare Pages.
3. Upload the contents of the `site/` folder to the repo root (or push via git if you're comfortable with it). `pipeline/export_data.py` doesn't need to live in the repo — it runs in Colab — but it's fine to keep it there for your own reference.

## 2. Connect Cloudflare Pages
1. Sign up for a free Cloudflare account (cloudflare.com).
2. In the dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize GitHub, pick the `field-position` repo.
4. Build settings: leave **build command blank** and set **build output directory** to the folder containing `index.html` (e.g. `site` if you kept that structure, or `/` if you uploaded the files at repo root).
5. Deploy. Cloudflare gives you a free `*.pages.dev` URL immediately — that's a fully working, free, live site before you spend a cent on a domain.

## 3. Buy and connect a domain
1. Buy a domain wherever you like (Cloudflare Registrar is convenient since you're already there, but any registrar works).
2. In the Pages project → **Custom domains → Set up a custom domain**, enter your domain, follow the DNS prompts. If you bought it through Cloudflare, this is close to one click; if elsewhere, you'll add a CNAME record pointing at your `*.pages.dev` address.

## 4. Refresh the data weekly
Each week during the season, in your Colab notebook:
1. Re-run your existing pipeline cells for the new week's games/stats/lines (same cells you already have).
2. Re-run the model cells so `model_margin` / `model_total` reflect the latest data.
3. Add the `export_data.py` cell at the end and run it — it downloads `rankings.json` and `matchups.json`.
4. Upload those two files to your GitHub repo (drag-and-drop replace via the GitHub web UI works fine, or `git add . && git commit && git push` if you're set up locally).
5. Cloudflare Pages auto-redeploys within roughly a minute of the push — no manual redeploy step needed.

This manual weekly loop (run notebook → download 2 files → drag into GitHub) is the simplest version and costs nothing beyond your existing Patreon tier. If it becomes a chore, the next step is automating step 3-4 with a GitHub Action that runs your notebook's logic as a scheduled script and commits the JSON directly — worth doing once you're confident the manual version is stable and you're not still actively tweaking the model shape.

## Notes on the "why" blurb
The sample blurb generator in `export_data.py` is rule-based (compares model output to market lines and describes the gap in plain language) — no API cost, no extra moving part. If you want richer, more natural writeups later, that's where a small number of Claude API calls per week would come in — but the rule-based version is a reasonable place to start and confirm the site works end-to-end first.

## On legality/framing
The site copy already includes "for research & entertainment purposes only" in the header — keep language like that visible, and keep in mind (as discussed) that this reduces but doesn't eliminate risk; it's not a substitute for an actual legal review if this grows beyond a personal/testing project.
