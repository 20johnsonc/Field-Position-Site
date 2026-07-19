# =============================================================================
# EXPORT CELL — add this as a new cell at the END of your existing Colab notebook,
# AFTER model_margin, model_total, team_snapshot, rankings_df, and predict_matchup
# have all been built. It reuses those variables directly — nothing is redefined.
#
# Produces two files: rankings.json and matchups.json
# These are the only two files the website reads. Nothing else needs to change
# on the site side when your models change — as long as these two shapes hold.
# =============================================================================

import json
from datetime import datetime, timezone

CURRENT_YEAR = TEST_YEAR  # reuse whatever year you've been treating as "current"

# --- 1. Find the next slate of upcoming (not-yet-played) FBS games ---------
upcoming_games = games_api.get_games(year=CURRENT_YEAR, classification='fbs')
upcoming_games = [g for g in upcoming_games if g.home_points is None and g.away_points is None]

if upcoming_games:
    next_week = min(g.week for g in upcoming_games if g.week is not None)
    upcoming_games = [g for g in upcoming_games if g.week == next_week]
else:
    next_week = None

print(f"Found {len(upcoming_games)} upcoming games for week {next_week}")

# --- 2. Build a short, rule-based "why" blurb (swap for a Claude API call later) --
def make_blurb(home, away, pred_margin, pred_total, market_spread, market_total):
    fav = home if pred_margin > 0 else away
    margin_diff = None
    lines = []

    if market_spread is not None:
        model_implied = -pred_margin  # convert margin to spread convention (home favored = negative)
        edge = market_spread - model_implied
        if abs(edge) >= 3:
            side = home if edge > 0 else away
            lines.append(f"model leans {abs(edge):.1f} pts toward {side} vs. the market spread")
        else:
            lines.append("model is close to the market spread")
    else:
        lines.append(f"model favors {fav} by {abs(pred_margin):.1f}")

    if market_total is not None:
        total_edge = pred_total - market_total
        if abs(total_edge) >= 3:
            lean = "over" if total_edge > 0 else "under"
            lines.append(f"leans {lean} the {market_total:.1f} total by {abs(total_edge):.1f} pts")
        else:
            lines.append("close to the posted total")

    return "; ".join(lines).capitalize() + "."

# --- 3. Build matchups.json ------------------------------------------------
matchups = []
for g in upcoming_games:
    home, away = g.home_team, g.away_team
    if home not in team_snapshot or away not in team_snapshot:
        continue  # team missing stats this season (FCS opponent, early-season gap, etc.)

    pred = predict_matchup(home, away)
    market_spread = lines_lookup.get(g.id)
    market_total = overunder_lookup.get(g.id)

    matchups.append({
        "game_id": g.id,
        "week": g.week,
        "start_date": str(g.start_date) if g.start_date else None,
        "home_team": home,
        "away_team": away,
        "predicted_score": pred["predicted_score"],
        "predicted_margin": pred["predicted_margin"],
        "predicted_total": pred["predicted_total"],
        "home_win_prob": pred["home_win_prob"],
        "market_spread": market_spread,      # negative = home favored, CFBD convention
        "market_total": market_total,
        "blurb": make_blurb(home, away, pred["predicted_margin"], pred["predicted_total"],
                             market_spread, market_total),
    })

with open("matchups.json", "w") as f:
    json.dump({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "week": next_week,
        "year": CURRENT_YEAR,
        "games": matchups,
    }, f, indent=2)

print(f"Wrote matchups.json with {len(matchups)} games")

# --- 4. Build rankings.json (from your existing rankings_df) --------------
rankings_export = rankings_df.reset_index().rename(columns={"index": "rank"}).to_dict(orient="records")

with open("rankings.json", "w") as f:
    json.dump({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "year": CURRENT_YEAR,
        "teams": rankings_export,
    }, f, indent=2)

print(f"Wrote rankings.json with {len(rankings_export)} teams")

# --- 5. Download both, or push straight to GitHub from here ---------------
from google.colab import files
files.download("rankings.json")
files.download("matchups.json")

# Optional: instead of downloading manually each week, you can have this cell
# commit straight to your site's GitHub repo using the GitHub API + a personal
# access token stored in Colab secrets (userdata.get('GITHUB_TOKEN')) — ask if
# you want that automated version once the manual flow is working.
