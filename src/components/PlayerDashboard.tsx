import React, { useState, useEffect, useMemo } from 'react';
import ShotChart from './ShotChart';

interface PlayerDashboardProps {
  player: any;
  year: number;
}

export default function PlayerDashboard({ player, year }: PlayerDashboardProps) {
  const [gameFilter, setGameFilter] = useState<string>('all');
  const [gameLogs, setGameLogs] = useState<any[]>([]);
  const [allShots, setAllShots] = useState<any[]>([]); // <-- New state for shots

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch Game Logs
        const logsRes = await fetch(`/data/basketball/${year}/game_logs.json`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setGameLogs(logsData[String(player.player_id || player.id)] || []);
        }

        // 2. Fetch Shots (for the single-game profile calculation)
        const shotsRes = await fetch(`/data/basketball/${year}/shots.json`);
        if (shotsRes.ok) {
          const shotsData = await shotsRes.json();
          setAllShots(shotsData[String(player.player_id || player.id)] || []);
        }
      } catch (e) {}
    }
    fetchData();
  }, [year, player]);

  const activeGame = gameFilter !== 'all' ? gameLogs.find(g => String(g.game_id) === gameFilter) : null;

  // Box Score Logic
  const boxStats = activeGame ? {
    pts: activeGame.points, reb: activeGame.rebounds, ast: activeGame.assists,
    stl: activeGame.steals, blk: activeGame.blocks, tov: activeGame.turnovers,
    min: activeGame.minutes, ftm: activeGame.ftm, fta: activeGame.fta,
    ts: null, usg: null, porpag: null
  } : {
    pts: player.pts_pg, reb: player.reb_pg, ast: player.ast_pg,
    stl: player.stl_pg, blk: player.blk_pg, tov: player.tov_pg,
    min: player.min_pg, ftm: player.ftm, fta: player.fta,
    ts: player.ts_pct, usg: player.usage, porpag: player.porpag
  };

  const displayPlayTypes = useMemo(() => {
    if (!activeGame) {
      // Season Play Types (from players.json)
      return player.play_types ? Object.entries(player.play_types).map(([type, d]: [string, any]) => ({
        type, ppp: d.ppp, freq: d.freq_pg || d.freq
      })).sort((a,b) => b.freq - a.freq) : [];
    }
    
    // Game Shot Profile (Calculated from shots.json)
    const gameShots = allShots.filter((s: any) => String(s.game_id) === gameFilter);
    const zones: Record<string, { made: number, att: number }> = {};
    
    gameShots.forEach((s: any) => {
      let z = 'Jumper';
      const rng = (s.range || '').toLowerCase();
      if (rng.includes('rim') || rng.includes('layup') || rng.includes('dunk')) z = 'Rim';
      else if (rng.includes('three') || rng.includes('3')) z = '3PT';
      else if (rng.includes('free') || rng.includes('ft')) z = 'FT';
      
      if (!zones[z]) zones[z] = { made: 0, att: 0 };
      zones[z].att++;
      if (s.made) zones[z].made++;
    });
    
    return Object.entries(zones).map(([type, d]) => ({
      type, ppp: null, freq: `${d.made}-${d.att}`
    })).sort((a,b) => parseInt(b.freq.split('-')[1]) - parseInt(a.freq.split('-')[1]));
  }, [activeGame, player, gameFilter, allShots]);

  const fmt = (v: number | null, d = 1) => v == null ? '—' : Number(v).toFixed(d);
  const pct = (v: number | null) => {
    if (v == null) return '—';
    const val = v > 1 ? v : v * 100;
    return val.toFixed(1) + '%';
  };

  const RankBadge = ({ rank }: { rank: number | null | undefined }) => {
    if (!rank || activeGame || rank > 100) return null;
    let color = 'var(--text-muted)';
    let bg = 'var(--surface-3)';
    if (rank <= 10) { color = '#d97706'; bg = 'rgba(217, 119, 6, 0.15)'; }
    else if (rank <= 25) { color = '#64748b'; bg = 'rgba(100, 116, 139, 0.15)'; }
    else if (rank <= 50) { color = '#b45309'; bg = 'rgba(180, 83, 9, 0.15)'; }
    
    return (
      <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', fontWeight: 800, color, background: bg, verticalAlign: 'middle' }}>
        #{rank}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div className="card" style={{ padding: '20px' }}>
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>RAPM Breakdown</h2>
        <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="stat-box">
            <span className="stat-label">Off RAPM</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-success)' }}>{fmt(player.offensive_rating)}</strong></span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Def RAPM</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-info)' }}>{fmt(player.defensive_rating)}</strong></span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Prev Season Net</span>
            <span className="stat-comparison"><strong>{fmt(player.prev_net_rating)}</strong></span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '24px', alignItems: 'start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="card" style={{ padding: '20px' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>
              {activeGame ? `Box Score @ ${activeGame.opponent}` : 'Box Score (Season)'}
            </h2>
            <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              
              <div className="stat-box">
                <span className="stat-label">PPG</span>
                <span className="stat-comparison">
                  <strong>{fmt(boxStats.pts)}</strong>
                  <RankBadge rank={player.pts_pg_rank} />
                </span>
              </div>
              
              <div className="stat-box">
                <span className="stat-label">RPG</span>
                <span className="stat-comparison">
                  <strong>{fmt(boxStats.reb)}</strong>
                  <RankBadge rank={player.reb_pg_rank} />
                </span>
              </div>
              
              <div className="stat-box">
                <span className="stat-label">APG</span>
                <span className="stat-comparison">
                  <strong>{fmt(boxStats.ast)}</strong>
                  <RankBadge rank={player.ast_pg_rank} />
                </span>
              </div>
              
              <div className="stat-box">
                <span className="stat-label">SPG</span>
                <span className="stat-comparison">
                  <strong>{fmt(boxStats.stl)}</strong>
                  <RankBadge rank={player.stl_pg_rank} />
                </span>
              </div>
              
              <div className="stat-box">
                <span className="stat-label">BPG</span>
                <span className="stat-comparison">
                  <strong>{fmt(boxStats.blk)}</strong>
                  <RankBadge rank={player.blk_pg_rank} />
                </span>
              </div>
              
              <div className="stat-box">
                <span className="stat-label">TO</span>
                <span className="stat-comparison"><strong>{fmt(boxStats.tov)}</strong></span>
              </div>
              
              <div className="stat-box"><span className="stat-label">FTM</span><span className="stat-comparison"><strong>{fmt(boxStats.ftm)}</strong></span></div>
              <div className="stat-box"><span className="stat-label">FTA</span><span className="stat-comparison"><strong>{fmt(boxStats.fta)}</strong></span></div>
              <div className="stat-box"><span className="stat-label">FT%</span><span className="stat-comparison"><strong>{boxStats.ftm && boxStats.fta ? ((boxStats.ftm / boxStats.fta) * 100).toFixed(1) + '%' : '—'}</strong></span></div>

              {!activeGame && (
                <>
                  <div className="stat-box">
                    <span className="stat-label">TS%</span>
                    <span className="stat-comparison">
                      <strong>{pct(boxStats.ts)}</strong>
                      <RankBadge rank={player.ts_pct_rank} />
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">USG%</span>
                    <span className="stat-comparison">
                      <strong>{pct(boxStats.usg)}</strong>
                      <RankBadge rank={player.usage_rank} />
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">PORPAG</span>
                    <span className="stat-comparison">
                      <strong>{fmt(boxStats.porpag)}</strong>
                      <RankBadge rank={player.porpag_rank} />
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {displayPlayTypes.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>
                {activeGame ? 'Shot Profile (Game)' : 'Play Types (Season)'}
              </h2>
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                <table className="rank-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      {!activeGame && <th className="num">PPP</th>}
                      <th className="num">{activeGame ? 'M-A' : 'Freq/G'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPlayTypes.map((pt) => (
                      <tr key={pt.type}>
                        <td style={{ textTransform: 'capitalize' }}>{pt.type.replace(/_/g, ' ')}</td>
                        {!activeGame && <td className="num rating">{pt.ppp?.toFixed(2)}</td>}
                        <td className="num" style={{ color: 'var(--text-muted)' }}>
                          {activeGame ? pt.freq : pt.freq.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <ShotChart 
            year={year} 
            playerId={String(player.player_id || player.id)} 
            externalGameFilter={gameFilter}
            onGameFilterChange={setGameFilter}
          />
        </div>

      </div>
    </div>
  );
}