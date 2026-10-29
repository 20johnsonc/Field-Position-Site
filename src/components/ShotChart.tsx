import React, { useState, useMemo, useEffect } from 'react';

interface Shot {
  game_id: number;
  x: number;
  y: number;
  made: boolean;
  range: string;
}

interface Props {
  year: number;
  playerId: string;
  externalGameFilter: string;
  onGameFilterChange: (val: string) => void;
}

export default function ShotChart({ year, playerId, externalGameFilter, onGameFilterChange }: Props) {
  const [resultFilter, setResultFilter] = useState<'all' | 'makes' | 'misses'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [hoveredShot, setHoveredShot] = useState<Shot | null>(null);
  
  const [shots, setShots] = useState<Shot[]>([]);
  const [gameOptions, setGameOptions] = useState<{ id: string, label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Fetch Game Logs for opponent names
        const logsRes = await fetch(`/data/basketball/${year}/game_logs.json`);
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          const logs = logsData[playerId] || [];
          const opts = logs.map((g: any) => {
            const date = new Date(g.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            const prefix = g.is_home ? 'vs' : '@';
            return {
              id: String(g.game_id),
              label: `${date} - ${prefix} ${g.opponent || 'Unknown'}`
            };
          });
          setGameOptions(opts);
        }

        // 2. Fetch Shots from the separate file
        const shotsRes = await fetch(`/data/basketball/${year}/shots.json`);
        if (shotsRes.ok) {
          const shotsData = await shotsRes.json();
          setShots(shotsData[playerId] || []);
        }
      } catch (e) {
        console.error("Failed to load shot chart data", e);
      } finally {
        setLoading(false);
      }
    }
    if (playerId && year) fetchData();
  }, [playerId, year]);

  const SVG_W = 500;
  const SVG_H = 470;

  // Build Unique Games Dropdown (Only show games that have shots)
  const uniqueGames = useMemo(() => {
    const gamesWithShots = new Set(shots.map(s => String(s.game_id)));
    return gameOptions.filter(g => gamesWithShots.has(g.id));
  }, [gameOptions, shots]);

  const filteredShots = shots.filter(s => {
    if (resultFilter === 'makes' && !s.made) return false;
    if (resultFilter === 'misses' && s.made) return false;
    if (externalGameFilter !== 'all' && String(s.game_id) !== externalGameFilter) return false;

    if (zoneFilter !== 'all') {
      const rng = (s.range || '').toLowerCase();
      if (zoneFilter === 'rim' && !rng.includes('rim') && !rng.includes('layup') && !rng.includes('dunk')) return false;
      if (zoneFilter === 'jumper' && !rng.includes('jump') && !rng.includes('mid')) return false;
      if (zoneFilter === 'three' && !rng.includes('three') && !rng.includes('3')) return false;
      if (zoneFilter === 'ft' && !rng.includes('free') && !rng.includes('ft')) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading shots...</div>;
  if (shots.length === 0) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>No shot data available for this player.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      
      {/* Top Controls */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'makes', 'misses'].map(f => (
            <button 
              key={f} onClick={() => setResultFilter(f as any)}
              style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--card-border)', background: resultFilter === f ? 'var(--accent-primary)' : 'var(--surface-1)', color: resultFilter === f ? '#fff' : 'var(--text)', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600, transition: 'all 0.2s ease', fontSize: '0.85rem' }}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'rim', 'jumper', 'three', 'ft'].map(f => (
            <button 
              key={f} onClick={() => setZoneFilter(f)}
              style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--card-border)', background: zoneFilter === f ? 'var(--text)' : 'var(--surface-1)', color: zoneFilter === f ? 'var(--surface-1)' : 'var(--text)', cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600, transition: 'all 0.2s ease', fontSize: '0.85rem' }}
            >
              {f === 'three' ? '3PT' : f === 'ft' ? 'FT' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Game Filter Dropdown */}
      {uniqueGames.length > 1 && (
        <select 
          value={externalGameFilter} onChange={(e) => onGameFilterChange(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--card-border)', background: 'var(--surface-1)', color: 'var(--text)', fontSize: '0.9rem', fontWeight: 600, width: '100%' }}
        >
          <option value="all">All Games</option>
          {uniqueGames.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* SVG Court */}
      <div style={{ position: 'relative', width: '100%', background: 'var(--surface-2)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
        
        {hoveredShot && (
          <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'var(--surface-1)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--card-border)', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <span style={{ color: hoveredShot.made ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              {hoveredShot.made ? 'Made' : 'Missed'} {hoveredShot.range}
            </span>
          </div>
        )}

        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          
          {/* Court Lines */}
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="none" />
          <rect x="190" y="280" width="120" height="190" fill="var(--accent-primary)" opacity="0.05" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 190 280 A 60 60 0 0 1 310 280" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 190 280 A 60 60 0 0 0 310 280" fill="none" stroke="var(--card-border)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 30 470 L 30 328 A 237.5 237.5 0 0 1 470 328 L 470 470" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 210 417.5 A 40 40 0 0 1 290 417.5" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <line x1="220" y1="430" x2="280" y2="430" stroke="var(--text-muted)" strokeWidth="3" />
          <circle cx="250" cy="417.5" r="7.5" fill="none" stroke="var(--accent-danger)" strokeWidth="2" />

          {/* Render Scatter Shots */}
          {filteredShots.map((s, i) => {
            let x_ft = s.x / 10;
            let y_ft = s.y / 10;

            // Fallback for missing coordinates (e.g. Free Throws)
            if (s.range && s.range.toLowerCase().includes('free')) {
              x_ft = 19;
              y_ft = 25;
            }

            const x_half = x_ft <= 47 ? x_ft : 94 - x_ft;
            const y_half = x_ft <= 47 ? y_ft : 50 - y_ft;

            const cx = (y_half / 50) * SVG_W;
            const cy = SVG_H - ((x_half / 47) * SVG_H);

            if (cx < 0 || cx > SVG_W || cy < 0 || cy > SVG_H) return null;

            return (
              <circle 
                key={i} cx={cx} cy={cy} r={5} 
                fill={s.made ? 'var(--accent-success)' : 'var(--accent-danger)'}
                opacity={0.85} stroke="var(--surface-1)" strokeWidth={1}
                onMouseEnter={() => setHoveredShot(s)}
                onMouseLeave={() => setHoveredShot(null)}
                style={{ cursor: 'crosshair', transition: 'r 0.1s ease, stroke-width 0.1s ease' }}
                onMouseOver={(e) => { (e.target as SVGCircleElement).setAttribute('r', '7'); (e.target as SVGCircleElement).setAttribute('stroke-width', '2'); }}
                onMouseOut={(e) => { (e.target as SVGCircleElement).setAttribute('r', '5'); (e.target as SVGCircleElement).setAttribute('stroke-width', '1'); }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}