import React, { useState, useEffect } from 'react';

interface Shot {
  game_id: number;
  x: number;
  y: number;
  made: boolean;
  range: string;
}

interface Props {
  year: number;
  playerId?: string; 
  teamName: string;
  externalGameFilter?: string;
  onGameFilterChange?: (val: string) => void;
}

const COURT_LENGTH_FT = 36;
const SVG_W = 500;
const SVG_H = COURT_LENGTH_FT * 10;

function shotCoords(s: Shot): { cx: number; cy: number; xHalf: number; yHalf: number } {
  const xFt = s.x / 10;
  const yFt = s.y / 10;

  const xHalf = xFt <= 47 ? xFt : 94 - xFt;
  const yHalf = xFt <= 47 ? yFt : 50 - yFt;

  return {
    cx: (yHalf / 50) * SVG_W,
    cy: SVG_H - (xHalf / COURT_LENGTH_FT) * SVG_H,
    xHalf,
    yHalf,
  };
}

function shotDistance(s: Shot): number {
  const { xHalf, yHalf } = shotCoords(s);
  return Math.hypot(xHalf - 5.25, yHalf - 25);
}

function shotZone(s: Shot): string {
  const { xHalf, yHalf } = shotCoords(s);
  const dist = Math.hypot(xHalf - 5.25, yHalf - 25);
  const offCenter = Math.abs(yHalf - 25);
  const side = yHalf < 25 ? 'Left' : 'Right';

  if (dist < 4) return 'Restricted Area';
  if (xHalf < 19 && offCenter < 8) {
    return xHalf < 10 ? `${side} Block` : 'Paint';
  }

  const isCorner3 = xHalf <= 14.2 && offCenter >= 22;
  const isArc3 = dist >= 22.15;
  if (isCorner3) return `${side} Corner 3`;
  if (isArc3) return offCenter < 8 ? 'Top of Key 3' : `${side} Wing 3`;

  if (offCenter < 6 && xHalf >= 19) return 'Top of Key';
  if (Math.abs(xHalf - 19) < 3 && offCenter >= 6 && offCenter < 12) return `${side} Elbow`;
  return `${side} Mid-Range`;
}

function formatRange(range: string | null | undefined): string {
  if (!range) return 'Shot';
  const r = range.toLowerCase();
  if (r.includes('dunk')) return 'Dunk';
  if (r.includes('layup')) return 'Layup';
  if (r.includes('three') || r === '3pt' || r.includes('3')) return '3-Pointer';
  if (r.includes('rim')) return 'Rim';
  if (r.includes('jumper') || r.includes('jump')) return 'Jumper';
  return range;
}

export default function ShotChart({ 
  year, 
  playerId, 
  teamName, 
  externalGameFilter, 
  onGameFilterChange 
}: Props) {
  const [resultFilter, setResultFilter] = useState<'all' | 'makes' | 'misses'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [hoveredShot, setHoveredShot] = useState<Shot | null>(null);
  const [internalGameFilter, setInternalGameFilter] = useState<string>('all');

  // If external filter isn't provided, manage it internally
  const activeGameFilter = externalGameFilter !== undefined ? externalGameFilter : internalGameFilter;
  const handleGameFilterChange = (val: string) => {
    if (onGameFilterChange) onGameFilterChange(val);
    else setInternalGameFilter(val);
  };

  const [shots, setShots] = useState<Shot[]>([]);
  const [gameOptions, setGameOptions] = useState<{ id: string, label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const teamSlug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  useEffect(() => {
    async function fetchData() {
      try {
        // 1. Game logs (for the game dropdown labels)
        const logsRes = await fetch(`/data/basketball/${year}/game_logs/${teamSlug}.json`);
        if (logsRes.ok) {
          const teamLogs = await logsRes.json();
          
          const logs = playerId ? (teamLogs[playerId] || []) : Object.values(teamLogs).flat() as any[];
          
          const uniqueGamesMap = new Map();
          logs.forEach((g: any) => {
            if (!uniqueGamesMap.has(g.game_id)) uniqueGamesMap.set(g.game_id, g);
          });

          const sortedLogs = Array.from(uniqueGamesMap.values()).sort(
            (a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
          );

          const opts = sortedLogs.map((g: any) => {
            const date = new Date(g.start_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', timeZone: 'UTC',
            });
            const prefix = g.is_home ? 'vs' : '@';
            return { id: String(g.game_id), label: `${date} - ${prefix} ${g.opponent}` };
          });
          setGameOptions(opts);
        }

        // 2. Shots (for the chart) — free throws filtered out here
        const shotsRes = await fetch(`/data/basketball/${year}/shots/${teamSlug}.json`);
        if (shotsRes.ok) {
          const teamShots = await shotsRes.json();
          const allShots: Shot[] = playerId ? (teamShots[playerId] || []) : Object.values(teamShots).flat() as Shot[];
          
          setShots(allShots.filter((s) => {
            const r = (s.range || '').toLowerCase();
            return !r.includes('free') && r !== 'ft';
          }));
        }
      } catch (e) {
        console.error('Failed to load shot chart data', e);
      } finally {
        setLoading(false);
      }
    }
    if (year && teamSlug) fetchData();
  }, [playerId, year, teamSlug]);

  // Removed the filter: we want the dropdown to match the game logs exactly
  const uniqueGames = gameOptions;

  const filteredShots = shots.filter(s => {
    if (resultFilter === 'makes' && !s.made) return false;
    if (resultFilter === 'misses' && s.made) return false;
    if (activeGameFilter !== 'all' && String(s.game_id) !== activeGameFilter) return false;

    if (zoneFilter !== 'all') {
      const rng = (s.range || '').toLowerCase();
      if (zoneFilter === 'rim' && !rng.includes('rim') && !rng.includes('layup') && !rng.includes('dunk')) return false;
      if (zoneFilter === 'jumper' && !rng.includes('jump') && !rng.includes('mid')) return false;
      if (zoneFilter === 'three' && !rng.includes('three') && !rng.includes('3')) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading shots...</div>;

  const hoveredCoords = hoveredShot ? shotCoords(hoveredShot) : null;
  const hoveredDist = hoveredShot ? shotDistance(hoveredShot) : null;
  const hoveredZone = hoveredShot ? shotZone(hoveredShot) : null;
  const hoveredGame = hoveredShot ? gameOptions.find(g => g.id === String(hoveredShot.game_id)) : null;

  const tooltipPos: React.CSSProperties =
    hoveredCoords && hoveredCoords.cx < 250 && hoveredCoords.cy < 180
      ? { top: '12px', right: '12px' }
      : { top: '12px', left: '12px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

      {/* Top Controls */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'makes', 'misses'].map(f => (
            <button
              key={f} onClick={() => setResultFilter(f as any)}
              style={{
                padding: '6px 12px', borderRadius: '4px',
                border: '1px solid var(--card-border)',
                background: resultFilter === f ? 'var(--accent-primary)' : 'var(--surface-1)',
                color: resultFilter === f ? '#fff' : 'var(--text)',
                cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600,
                transition: 'all 0.2s ease', fontSize: '0.85rem',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Zone filter */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'rim', 'jumper', 'three'].map(f => (
            <button
              key={f} onClick={() => setZoneFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: '4px',
                border: '1px solid var(--card-border)',
                background: zoneFilter === f ? 'var(--text)' : 'var(--surface-1)',
                color: zoneFilter === f ? 'var(--surface-1)' : 'var(--text)',
                cursor: 'pointer', textTransform: 'capitalize', fontWeight: 600,
                transition: 'all 0.2s ease', fontSize: '0.85rem',
              }}
            >
              {f === 'three' ? '3PT' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Game Filter Dropdown */}
      {uniqueGames.length > 0 && (
        <select
          value={activeGameFilter} onChange={(e) => handleGameFilterChange(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '4px',
            border: '1px solid var(--card-border)',
            background: 'var(--surface-1)', color: 'var(--text)',
            fontSize: '0.9rem', fontWeight: 600, width: '100%',
          }}
        >
          <option value="all">All Games</option>
          {uniqueGames.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* SVG Court */}
      <div style={{
        position: 'relative', width: '100%',
        background: 'var(--surface-2)', borderRadius: '8px',
        overflow: 'hidden', border: '1px solid var(--card-border)',
      }}>

        {/* No Shots Overlay */}
        {filteredShots.length === 0 && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.05)', zIndex: 5,
            color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem',
            backdropFilter: 'blur(2px)'
          }}>
            No shot data available for this selection.
          </div>
        )}

        {/* Tooltip */}
        {hoveredShot && (
          <div style={{
            position: 'absolute', ...tooltipPos,
            background: 'var(--surface-1)', padding: '10px 14px',
            borderRadius: '6px', border: '1px solid var(--card-border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '0.85rem', pointerEvents: 'none', zIndex: 10,
            minWidth: '190px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '6px',
              color: hoveredShot.made ? 'var(--accent-success)' : 'var(--accent-danger)',
              fontWeight: 700,
            }}>
              <span>{hoveredShot.made ? '✓' : '✗'}</span>
              <span>{hoveredShot.made ? 'Made' : 'Missed'}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {formatRange(hoveredShot.range)}
              </span>
            </div>

            <div style={{
              color: 'var(--text-muted)', fontSize: '0.8rem',
              display: 'flex', justifyContent: 'space-between', gap: '12px',
            }}>
              <span>{hoveredZone}</span>
              {hoveredDist !== null && (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {hoveredDist.toFixed(1)} ft
                </span>
              )}
            </div>

            {hoveredGame && activeGameFilter === 'all' && (
              <div style={{
                color: 'var(--text-muted)', fontSize: '0.75rem',
                marginTop: '4px', opacity: 0.8,
              }}>
                {hoveredGame.label}
              </div>
            )}
          </div>
        )}

        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="none" />
          <rect x="190" y="170" width="120" height="190" fill="var(--accent-primary)" opacity="0.05" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 190 170 A 60 60 0 0 1 310 170" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 190 170 A 60 60 0 0 0 310 170" fill="none" stroke="var(--card-border)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 30 360 L 30 282 A 221.5 221.5 0 0 1 470 282 L 470 360" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <path d="M 210 307.5 A 40 40 0 0 1 290 307.5" fill="none" stroke="var(--card-border)" strokeWidth="2" />
          <line x1="220" y1="320" x2="280" y2="320" stroke="var(--text-muted)" strokeWidth="3" />
          <circle cx="250" cy="307.5" r="7.5" fill="none" stroke="var(--accent-danger)" strokeWidth="2" />

          {filteredShots.map((s, i) => {
            const { cx, cy } = shotCoords(s);
            if (cx < 0 || cx > SVG_W || cy < 0 || cy > SVG_H) return null;

            const isHovered = hoveredShot === s;
            const color = s.made ? 'var(--accent-success)' : 'var(--accent-danger)';

            return (
              <circle
                key={i} cx={cx} cy={cy} r={isHovered ? 7 : 5.5}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.35}
                stroke={color}
                strokeOpacity={isHovered ? 1 : 0.8}
                strokeWidth={isHovered ? 2 : 1}
                onMouseEnter={() => setHoveredShot(s)}
                onMouseLeave={() => setHoveredShot(null)}
                style={{ cursor: 'crosshair', transition: 'all 0.1s ease' }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}