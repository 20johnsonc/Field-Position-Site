import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'public', 'data', 'basketball');
const playerIndexFile = path.join(dataDir, 'player-index.json');
const teamIndexFile = path.join(dataDir, 'team-index.json');

const playerIndex = {};
const teamIndex = {};

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const years = fs.readdirSync(dataDir).filter(f => fs.statSync(path.join(dataDir, f)).isDirectory());

for (const year of years) {
  const playersPath = path.join(dataDir, year, 'players.json');
  const rankingsPath = path.join(dataDir, year, 'rankings.json');

  // Generate Player Index
  if (fs.existsSync(playersPath)) {
    const data = JSON.parse(fs.readFileSync(playersPath, 'utf-8'));
    for (const p of (data.players || [])) {
      const id = String(p.player_id || p.id);
      if (!playerIndex[id]) playerIndex[id] = [];
      playerIndex[id].push(Number(year));
    }
  }

  // Generate Team Index
  if (fs.existsSync(rankingsPath)) {
    const data = JSON.parse(fs.readFileSync(rankingsPath, 'utf-8'));
    for (const t of (data.teams || [])) {
      const slug = slugify(t.team);
      if (!teamIndex[slug]) teamIndex[slug] = [];
      teamIndex[slug].push(Number(year));
    }
  }
}

// Sort years descending
for (const id in playerIndex) playerIndex[id].sort((a, b) => b - a);
for (const slug in teamIndex) teamIndex[slug].sort((a, b) => b - a);

fs.writeFileSync(playerIndexFile, JSON.stringify(playerIndex));
fs.writeFileSync(teamIndexFile, JSON.stringify(teamIndex));
console.log(`Generated indexes: ${Object.keys(playerIndex).length} players, ${Object.keys(teamIndex).length} teams.`);