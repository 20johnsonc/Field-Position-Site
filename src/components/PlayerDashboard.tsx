import React, { useState, useEffect, useMemo } from 'react';
import ShotChart from './ShotChart';

export default function PlayerDashboard({ player, year }: { player: any, year: number }) {
  const [gameFilter, setGameFilter] = useState<string>('all');
  const [gameLogs, setGameLogs] = useState<any[]>([]);
  const [allShots, setAllShots] = useState<any[]>([]);

  const teamSlug = player.team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const pid = String(player.player_id || player.id);

  useEffect(() => {
    async function fetchData() {
      try {
        const logsRes = await fetch(`/data/basketball/${year}/game_logs/${teamSlug}.json`);
        if (logsRes.ok) {
          const teamLogs = await logsRes.json();
          setGameLogs(teamLogs[pid] || []); 
        }

        const shotsRes = await fetch(`/data/basketball/${year}/shots/${teamSlug}.json`);
        if (shotsRes.ok) {
          const teamShots = await shotsRes.json();
          setAllShots(teamShots[pid] || []); 
        }
      } catch (e) {
        console.error("Failed to load team data", e);
      }
    }
    if (pid && year && teamSlug) fetchData();
  }, [year, pid, teamSlug]);

  const activeGame = gameFilter !== 'all' ? gameLogs.find(g => String(g.game_id) === gameFilter) : null;

  const seasonStats = useMemo(() => {
    if (gameLogs.length === 0) return null;
    let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, tov = 0, min = 0;
    let fgm = 0, fga = 0, tpm = 0, tpa = 0, ftm = 0, fta = 0;
    
    gameLogs.forEach(g => {
      pts += g.points || 0; reb += g.rebounds || 0; ast += g.assists || 0;
      stl += g.steals || 0; blk += g.blocks || 0; tov += g.turnovers || 0;
      min += g.minutes || 0; fgm += g.fgm || 0; fga += g.fga || 0;
      tpm += g.tpm || 0; tpa += g.tpa || 0; ftm += g.ftm || 0; fta += g.fta || 0;
    });
    
    const gp = gameLogs.length;
    const ts_pct = fga > 0 ? pts / (2 * (fga + 0.44 * fta)) : null;
    
    return {
      pts_pg: pts / gp, reb_pg: reb / gp, ast_pg: ast / gp, stl_pg: stl / gp,
      blk_pg: blk / gp, tov_pg: tov / gp, min_pg: min / gp, fgm_pg: fgm / gp,
      fga_pg: fga / gp, tpm_pg: tpm / gp, tpa_pg: tpa / gp, ftm_pg: ftm / gp, fta_pg: fta / gp, ts_pct
    };
  }, [gameLogs]);

  const boxStats = activeGame ? {
    pts: activeGame.points, reb: activeGame.rebounds, ast: activeGame.assists, stl: activeGame.steals, blk: activeGame.blocks, tov: activeGame.turnovers, min: activeGame.minutes, fgm: activeGame.fgm, fga: activeGame.fga, tpm: activeGame.tpm, tpa: activeGame.tpa, ftm: activeGame.ftm, fta: activeGame.fta
  } : seasonStats ? {
    pts: seasonStats.pts_pg, reb: seasonStats.reb_pg, ast: seasonStats.ast_pg, stl: seasonStats.stl_pg, blk: seasonStats.blk_pg, tov: seasonStats.tov_pg, min: seasonStats.min_pg, fgm: seasonStats.fgm_pg, fga: seasonStats.fga_pg, tpm: seasonStats.tpm_pg, tpa: seasonStats.tpa_pg, ftm: seasonStats.ftm_pg, fta: seasonStats.fta_pg
  } : {
    pts: player.pts_pg, reb: player.reb_pg, ast: player.ast_pg, stl: player.stl_pg, blk: player.blk_pg, tov: player.tov_pg, min: player.min_pg, fgm: null, fga: null, tpm: null, tpa: null, ftm: null, fta: null
  };

  const displayPlayTypes = useMemo(() => {
    const gp = gameLogs.length || 1;
    if (!activeGame) {
      if (!player.play_types) return [];
      const types = Object.entries(player.play_types).map(([type, d]: [string, any]) => ({
        type, ppp: d.ppp || 0, freq: d.freq || 0, freqPerGame: (d.freq || 0) / gp
      })).sort((a,b) => b.freqPerGame - a.freqPerGame);
      const maxFreq = types[0]?.freqPerGame || 1;
      return types.map(t => ({ ...t, maxFreq }));
    }
    return []; // Shot zones are handled separately now
  }, [activeGame, player, gameLogs.length]);

  // ─── NEW: Shot Zones Math ───
  const shotZones = useMemo(() => {
    if (!activeGame || !allShots || allShots.length === 0) return null;
    
    const zones: Record<string, { made: number, att: number, pct: number }> = {
      'Rim': { made: 0, att: 0, pct: 0 },
      'Paint': { made: 0, att: 0, pct: 0 },
      'Mid-Range': { made: 0, att: 0, pct: 0 },
      'Corner 3': { made: 0, att: 0, pct: 0 },
      'Above Break 3': { made: 0, att: 0, pct: 0 },
    };

    let totalAtt = 0, totalMade = 0;
    const gameShots = allShots.filter((s: any) => String(s.game_id) === gameFilter);

    gameShots.forEach((s: any) => {
      let rng = (s.range || '').toLowerCase();
      let key = 'Mid-Range';
      if (rng.includes('rim') || rng.includes('layup') || rng.includes('dunk')) key = 'Rim';
      else if (rng.includes('paint') || rng.includes('floater')) key = 'Paint';
      else if (rng.includes('corner')) key = 'Corner 3';
      else if (rng.includes('three') || rng.includes('3')) key = 'Above Break 3';
      else if (rng.includes('free') || rng.includes('ft')) return; // Skip FTs

      if (!zones[key]) zones[key] = { made: 0, att: 0, pct: 0 };
      zones[key].att++;
      totalAtt++;
      if (s.made) {
        zones[key].made++;
        totalMade++;
      }
    });

    if (totalAtt === 0) return null;

    Object.keys(zones).forEach(k => {
      zones[k].pct = zones[k].att > 0 ? (zones[k].made / zones[k].att) * 100 : 0;
    });

    return { zones, totalAtt, totalMade, fgPct: (totalMade / totalAtt) * 100 };
  }, [allShots, activeGame, gameFilter]);

  const fmt = (v: number | null, d = 1) => v == null ? '—' : Number(v).toFixed(d);
  const fmtSign = (v: number | null, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d);
  const fmtSeasonPct = (made: number | null | undefined, att: number | null | undefined) => (made == null || att == null || att === 0) ? '—' : ((made / att) * 100).toFixed(1) + '%';
  const fmtGameShooting = (made: number | null | undefined, att: number | null | undefined) => (made == null || att == null || att === 0) ? '—' : `${made}-${att} (${((made / att) * 100).toFixed(1)}%)`;

  const RankBadge = ({ rank }: { rank: number | null | undefined }) => {
    if (!rank || activeGame || rank > 100) return null;
    let color = 'var(--text-muted)', bg = 'var(--surface-3)';
    if (rank <= 10) { color = '#d97706'; bg = 'rgba(217, 119, 6, 0.15)'; }
    else if (rank <= 25) { color = '#64748b'; bg = 'rgba(100, 116, 139, 0.15)'; }
    else if (rank <= 50) { color = '#b45309'; bg = 'rgba(180, 83, 9, 0.15)'; }
    return <span style={{ fontSize: '0.6rem', padding: '2px 5px', borderRadius: '4px', fontWeight: 800, color, background: bg }}>#{rank}</span>;
  };

  const StatBox = ({ label, value, rank }: { label: string, value: string, rank?: number }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface-2)', borderRadius: '6px' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {rank && <RankBadge rank={rank} />}
        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: '40px', textAlign: 'right' }}>{value}</span>
      </div>
    </div>
  );

  const bprBlend = player.net_rating ?? 0;
  const obprBlend = player.offensive_rating ?? 0;
  const dbprBlend = player.defensive_rating ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* ─────────── BPR Breakdown ─────────── */}
      <div className="card" style={{ padding: '20px' }}>
        {/* Removed the 40/30/30 tag here */}
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>Overall BPR</h2>

        <div className="analytics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="stat-box">
            <span className="stat-label">Offensive BPR</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-success)', fontSize: '1.2rem' }}>{fmtSign(obprBlend)}</strong></span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Defensive BPR</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-info)', fontSize: '1.2rem' }}>{fmtSign(dbprBlend)}</strong></span>
          </div>
          <div className="stat-box" style={{ background: 'var(--surface-1)', border: '1px solid var(--card-border)' }}>
            <span className="stat-label" style={{ color: 'var(--text)' }}>Overall BPR</span>
            <span className="stat-comparison">
              <strong style={{ color: bprBlend >= 5 ? 'var(--accent-success)' : bprBlend <= 0 ? 'var(--accent-danger)' : 'var(--text)', fontSize: '1.2rem' }}>{fmtSign(bprBlend)}</strong>
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) 1fr', gap: '24px', alignItems: 'start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="card" style={{ padding: '20px' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>{activeGame ? `Box Score @ ${activeGame.opponent}` : 'Season Stats'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <StatBox label={activeGame ? 'PTS' : 'PPG'} value={fmt(boxStats.pts)} rank={player.pts_pg_rank} />
              <StatBox label={activeGame ? 'REB' : 'RPG'} value={fmt(boxStats.reb)} rank={player.reb_pg_rank} />
              <StatBox label={activeGame ? 'AST' : 'APG'} value={fmt(boxStats.ast)} rank={player.ast_pg_rank} />
              <StatBox label="STL" value={fmt(boxStats.stl)} rank={player.stl_pg_rank} />
              <StatBox label="BLK" value={fmt(boxStats.blk)} rank={player.blk_pg_rank} />
              <StatBox label="TO" value={fmt(boxStats.tov)} />
              <StatBox label="FG" value={activeGame ? fmtGameShooting(boxStats.fgm, boxStats.fga) : fmtSeasonPct(boxStats.fgm, boxStats.fga)} />
              <StatBox label="3PT" value={activeGame ? fmtGameShooting(boxStats.tpm, boxStats.tpa) : fmtSeasonPct(boxStats.tpm, boxStats.tpa)} />
              <StatBox label="FT" value={activeGame ? fmtGameShooting(boxStats.ftm, boxStats.fta) : fmtSeasonPct(boxStats.ftm, boxStats.fta)} />
              <StatBox label={activeGame ? 'MIN' : 'MPG'} value={fmt(boxStats.min)} />
            </div>
          </div>

          {/* Season Play Types */}
          {!activeGame && displayPlayTypes.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>Play Types (Season)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {displayPlayTypes.map((pt: any) => (
                  <div key={pt.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', alignItems: 'flex-end' }}>
                      <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{pt.type.replace(/_/g, ' ')}</span>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{pt.freqPerGame.toFixed(1)} /g</span>
                        <span style={{ fontWeight: 800 }}>{pt.ppp.toFixed(2)} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>PPP</span></span>
                      </div>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-3)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${(pt.freqPerGame / pt.maxFreq) * 100}%`, height: '100%', background: 'var(--accent-info)', borderRadius: '3px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NEW: Game Shot Zones */}
          {activeGame && shotZones && (
            <div className="card" style={{ padding: '20px' }}>
              <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>Shot Zones (Game)</h2>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-2)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total FG</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{shotZones.totalMade}-{shotZones.totalAtt}</div>
                </div>
                <div style={{ width: '1px', background: 'var(--card-border)', margin: '0 12px' }}></div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>FG%</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{shotZones.fgPct.toFixed(1)}%</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(shotZones.zones).map(([zone, data]) => {
                  if (data.att === 0) return null;
                  return (
                    <div key={zone}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600 }}>{zone}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{data.made}-{data.att} <span style={{ fontWeight: 700, color: 'var(--text)', marginLeft: '4px' }}>({data.pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--surface-3)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${data.pct}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: '3px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {player.clutch_stats && player.clutch_stats.fga > 0 && (
            <div className="card" style={{ padding: '20px', opacity: activeGame ? 0.5 : 1 }}>
              <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>Clutch (Season)</h2>
              <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="stat-box"><span className="stat-label">PTS</span><span className="stat-comparison"><strong>{player.clutch_stats.pts}</strong></span></div>
                <div className="stat-box"><span className="stat-label">FGM-A</span><span className="stat-comparison"><strong>{player.clutch_stats.fgm}-{player.clutch_stats.fga}</strong></span></div>
                <div className="stat-box"><span className="stat-label">FG%</span><span className="stat-comparison"><strong>{((player.clutch_stats.fgm / player.clutch_stats.fga) * 100).toFixed(1)}%</strong></span></div>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <ShotChart year={year} playerId={pid} teamName={player.team} externalGameFilter={gameFilter} onGameFilterChange={setGameFilter} />
        </div>

      </div>
    </div>
  );
}