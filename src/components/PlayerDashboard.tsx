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

  // Box Score Logic
  const boxStats = activeGame ? {
    pts: activeGame.points, 
    reb: activeGame.rebounds, 
    ast: activeGame.assists,
    stl: activeGame.steals, 
    blk: activeGame.blocks, 
    tov: activeGame.turnovers,
    min: activeGame.minutes,
    fgm: activeGame.fgm,
    fga: activeGame.fga,
    tpm: activeGame.tpm,
    tpa: activeGame.tpa,
    ftm: activeGame.ftm, 
    fta: activeGame.fta,
    ts: null, 
    usg: null
  } : {
    pts: player.pts_pg, 
    reb: player.reb_pg, 
    ast: player.ast_pg,
    stl: player.stl_pg, 
    blk: player.blk_pg, 
    tov: player.tov_pg,
    min: player.min_pg, 
    fgm: null, 
    fga: null,
    tpm: null,
    tpa: null,
    ftm: player.ftm, 
    fta: player.fta,
    ts: player.ts_pct, 
    usg: player.usage
  };

  const displayPlayTypes = useMemo(() => {
    if (!activeGame) {
      return player.play_types ? Object.entries(player.play_types).map(([type, d]: [string, any]) => ({
        type, ppp: d.ppp, freq: d.freq_pg || d.freq
      })).sort((a,b) => b.freq - a.freq) : [];
    }
    
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

  const fmtShooting = (made: number | null | undefined, att: number | null | undefined) => {
    if (made == null || att == null || att === 0) return '—';
    const pctVal = ((made / att) * 100).toFixed(1);
    return `${made}-${att} (${pctVal}%)`;
  };

  const RankBadge = ({ rank }: { rank: number | null | undefined }) => {
    if (!rank || activeGame || rank > 100) return null;
    let color = 'var(--text-muted)';
    let bg = 'var(--surface-3)';
    if (rank <= 10) { color = '#d97706'; bg = 'rgba(217, 119, 6, 0.15)'; }
    else if (rank <= 25) { color = '#64748b'; bg = 'rgba(100, 116, 139, 0.15)'; }
    else if (rank <= 50) { color = '#b45309'; bg = 'rgba(180, 83, 9, 0.15)'; }
    
    return (
      <span style={{ fontSize: '0.6rem', padding: '2px 5px', borderRadius: '4px', fontWeight: 800, color, background: bg, verticalAlign: 'middle' }}>
        #{rank}
      </span>
    );
  };

  // Compact Stat Box for the grid
  const StatBox = ({ label, value, rank }: { label: string, value: string, rank?: number }) => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '8px 12px', 
      background: 'var(--surface-2)', 
      borderRadius: '6px' 
    }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {rank && <RankBadge rank={rank} />}
        <span style={{ 
          fontSize: '0.95rem', 
          fontWeight: 600, 
          color: 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: '40px',
          textAlign: 'right'
        }}>
          {value}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* RAPM Breakdown */}
      <div className="card" style={{ padding: '20px' }}>
        <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>RAPM Breakdown</h2>
        <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="stat-box">
            <span className="stat-label">Off RAPM</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-success)' }}>{fmt(player.offensive_rating)}</strong></span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Def RAPM</span>
            <span className="stat-comparison"><strong style={{ color: 'var(--accent-info)' }}>{fmt(player.defensive_rating)}</strong></span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Compact Grid Box Score */}
          <div className="card" style={{ padding: '20px' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>
              {activeGame ? `Box Score @ ${activeGame.opponent}` : 'Season Stats'}
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <StatBox label={activeGame ? 'MIN' : 'MPG'} value={fmt(boxStats.min)} />
              <StatBox label="STL" value={fmt(boxStats.stl)} rank={player.stl_pg_rank} />
              
              <StatBox label={activeGame ? 'PTS' : 'PPG'} value={fmt(boxStats.pts)} rank={player.pts_pg_rank} />
              <StatBox label="BLK" value={fmt(boxStats.blk)} rank={player.blk_pg_rank} />
              
              <StatBox label={activeGame ? 'REB' : 'RPG'} value={fmt(boxStats.reb)} rank={player.reb_pg_rank} />
              <StatBox label="TO" value={fmt(boxStats.tov)} />
              
              <StatBox label={activeGame ? 'AST' : 'APG'} value={fmt(boxStats.ast)} rank={player.ast_pg_rank} />
              <StatBox label="TS%" value={pct(boxStats.ts)} rank={player.ts_pct_rank} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              <StatBox label="FG" value={fmtShooting(boxStats.fgm, boxStats.fga)} />
              <StatBox label="3PT" value={fmtShooting(boxStats.tpm, boxStats.tpa)} />
              <StatBox label="FT" value={fmtShooting(boxStats.ftm, boxStats.fta)} />
              <StatBox label="USG%" value={pct(boxStats.usg)} rank={player.usage_rank} />
            </div>
          </div>

          {/* Play Types */}
          {displayPlayTypes.length > 0 && (
            <div className="card" style={{ padding: '20px' }}>
              <h2 className="section-title" style={{ marginTop: 0, marginBottom: '16px' }}>
                {activeGame ? 'Shot Profile (Game)' : 'Play Types (Season)'}
              </h2>
              <div className="table-container" style={{ border: 'none', boxShadow: 'none', background: 'transparent' }}>
                <table className="rank-table compact-table" style={{ fontSize: '0.85rem' }}>
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

          {/* Clutch */}
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

        {/* Shot Chart */}
        <div className="card" style={{ padding: '24px' }}>
          <ShotChart 
            year={year} 
            playerId={pid} 
            teamName={player.team}
            externalGameFilter={gameFilter}
            onGameFilterChange={setGameFilter}
          />
        </div>

      </div>
    </div>
  );
}