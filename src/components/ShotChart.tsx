import React, { useState, useEffect, useMemo } from 'react';
import { ZONES, THREE_PT_PATH, SVG_W, SVG_H, getNormalizedCoords, getShotZone } from './courtGeometry';

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

// Heatmap color theme (Slate)
function getZoneColor(pct: number) {
  if (pct === 0) return 'rgba(241, 245, 249, 0.9)'; // slate-100
  if (pct < 25) return 'rgba(203, 213, 225, 0.9)';  // slate-300
  if (pct < 35) return 'rgba(148, 163, 184, 0.9)';  // slate-400
  if (pct < 45) return 'rgba(100, 116, 139, 0.9)';  // slate-500
  if (pct < 55) return 'rgba(71, 85, 105, 0.9)';    // slate-600
  return 'rgba(30, 41, 59, 0.95)';                  // slate-800
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
  const [showZones, setShowZones] = useState<boolean>(false);

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

  const zoneStats = useMemo(() => {
    const stats: Record<string, { made: number, att: number, pct: number }> = {};
    ZONES.forEach(z => { stats[z.name] = { made: 0, att: 0, pct: 0 }; });
    stats['Restricted Area'] = { made: 0, att: 0, pct: 0 };

    filteredShots.forEach(s => {
      const { widthFt, lengthFt } = getNormalizedCoords(s.x, s.y);
      const z = getShotZone(widthFt, lengthFt);
      if (!stats[z]) stats[z] = { made: 0, att: 0, pct: 0 };
      stats[z].att++;
      if (s.made) stats[z].made++;
    });
    
    Object.keys(stats).forEach(k => {
      stats[k].pct = stats[k].att > 0 ? (stats[k].made / stats[k].att) * 100 : 0;
    });
    
    return stats;
  }, [filteredShots]);

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading shots...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

      {/* Top Controls */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', padding: '4px', borderRadius: '8px' }}>
          {['all', 'makes', 'misses'].map(f => (
            <button
              key={f} onClick={() => setResultFilter(f as any)}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none',
                background: resultFilter === f ? 'var(--surface-1)' : 'transparent',
                color: resultFilter === f ? 'var(--text)' : 'var(--text-muted)',
                cursor: 'pointer', textTransform: 'capitalize', fontWeight: 700,
                fontSize: '0.8rem', boxShadow: resultFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', padding: '4px', borderRadius: '8px' }}>
          {['all', 'rim', 'jumper', 'three'].map(f => (
            <button
              key={f} onClick={() => setZoneFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none',
                background: zoneFilter === f ? 'var(--surface-1)' : 'transparent',
                color: zoneFilter === f ? 'var(--text)' : 'var(--text-muted)',
                cursor: 'pointer', textTransform: 'capitalize', fontWeight: 700,
                fontSize: '0.8rem', boxShadow: zoneFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {f === 'three' ? '3PT' : f}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowZones(!showZones)}
            style={{
              padding: '8px 16px', borderRadius: '6px',
              border: '1px solid var(--card-border)',
              background: showZones ? 'var(--text)' : 'transparent',
              color: showZones ? 'var(--surface-1)' : 'var(--text)',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            {showZones ? 'Show Shots' : 'Show Zones'}
          </button>
        </div>
      </div>

      {/* Game Dropdown */}
      {gameOptions.length > 0 && (
        <select
          value={activeGameFilter} onChange={(e) => handleGameFilterChange(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: '6px',
            border: '1px solid var(--card-border)',
            background: 'var(--surface-1)', color: 'var(--text)',
            fontSize: '0.9rem', fontWeight: 600, width: '100%', cursor: 'pointer',
            outline: 'none', appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px top 50%', backgroundSize: '10px auto'
          }}
        >
          <option value="all">All Games</option>
          {gameOptions.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* Court & Heatmap Container */}
      <div style={{
        position: 'relative', width: '100%',
        background: 'var(--surface-1)', 
        borderRadius: '12px', overflow: 'hidden', 
        border: '1px solid var(--card-border)',
        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)',
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      }}>
        
        {/* Tooltip */}
        {hoveredShot && !showZones && (
          <div style={{
            position: 'absolute', top: '12px', left: '12px',
            background: 'rgba(15, 23, 42, 0.95)', padding: '8px 12px',
            borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontSize: '0.8rem', pointerEvents: 'none', zIndex: 10,
            color: '#fff', display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <div style={{ color: hoveredShot.made ? '#4ade80' : '#f87171', fontWeight: 800 }}>
              {hoveredShot.made ? 'MADE' : 'MISS'}
            </div>
            <div style={{ color: '#94a3b8' }}>|</div>
            <div>{hoveredShot.range || 'Shot'}</div>
          </div>
        )}

        <svg 
          viewBox={`0 0 ${SVG_W} ${SVG_H}`} 
          style={{ width: '100%', height: 'auto', display: 'block' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width={SVG_W} height={SVG_H} fill={showZones ? 'var(--surface-2)' : 'transparent'} />
          
          {/* --- LAYER 1: HEATMAP ZONES --- */}
          {showZones && (
            <g>
              {ZONES.map(zone => {
                const stats = zoneStats[zone.name];
                if (!stats) return null;
                
                const bg = getZoneColor(stats.pct);
                const isDark = stats.pct >= 40;
                const textColor = isDark ? '#ffffff' : '#334155';
                const subTextColor = isDark ? 'rgba(255,255,255,0.8)' : '#64748b';
                
                return (
                  <g key={zone.name}>
                    <path d={zone.d} fill={bg} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    {stats.att > 0 && (
                      <>
                        <text x={zone.label.x} y={zone.label.y - 2} textAnchor="middle" fontSize={zone.label.small ? 11 : 20} fontWeight="900" fill={textColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {stats.pct.toFixed(0)}%
                        </text>
                        <text x={zone.label.x} y={zone.label.y + (zone.label.small ? 10 : 14)} textAnchor="middle" fontSize={zone.label.small ? 9 : 12} fontWeight="700" fill={subTextColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {stats.made}/{stats.att}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Restricted Area Circle */}
              {(() => {
                const stats = zoneStats['Restricted Area'];
                const bg = getZoneColor(stats.pct);
                const isDark = stats.pct >= 40;
                const textColor = isDark ? '#ffffff' : '#334155';
                const subTextColor = isDark ? 'rgba(255,255,255,0.8)' : '#64748b';
                return (
                  <g>
                    <circle cx="250" cy="417.5" r="40" fill={bg} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    {stats.att > 0 && (
                      <>
                        <text x="250" y="415" textAnchor="middle" fontSize="18" fontWeight="900" fill={textColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {stats.pct.toFixed(0)}%
                        </text>
                        <text x="250" y="430" textAnchor="middle" fontSize="11" fontWeight="700" fill={subTextColor} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {stats.made}/{stats.att}
                        </text>
                      </>
                    )}
                  </g>
                );
              })()}
            </g>
          )}

          {/* --- LAYER 2: COURT LINES --- */}
          <g opacity={showZones ? 0.4 : 1}>
            {/* Paint (Key) */}
            <rect x="190" y="280" width="120" height="190" fill="transparent" stroke="#94a3b8" strokeWidth="2" />
            
            {/* Free Throw Circle */}
            <path d="M 190 280 A 60 60 0 0 0 310 280" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 6" />
            <path d="M 190 280 A 60 60 0 0 1 310 280" fill="none" stroke="#94a3b8" strokeWidth="2" />
            
            {/* Restricted Area Arc */}
            <path d="M 210 417.5 A 40 40 0 0 1 290 417.5" fill="none" stroke="#94a3b8" strokeWidth="2" />
            
            {/* Backboard & Rim */}
            <line x1="220" y1="430" x2="280" y2="430" stroke="#64748b" strokeWidth="4" />
            <circle cx="250" cy="417.5" r="7.5" fill="none" stroke="#ef4444" strokeWidth="3" />
            
            {/* 3-Point Line (NCAA men's: 22' 1.75" arc, 21' 8" corners) */}
            <path d={THREE_PT_PATH} fill="none" stroke="#94a3b8" strokeWidth="2" />
          </g>

          {/* --- LAYER 3: INDIVIDUAL SHOTS --- */}
          {!showZones && filteredShots.map((s, i) => {
            const { cx, cy } = getNormalizedCoords(s.x, s.y);
            if (cx < 0 || cx > SVG_W || cy < 0 || cy > SVG_H) return null;

            const isHovered = hoveredShot === s;
            const color = s.made ? '#22c55e' : '#ef4444';

            return (
              <circle
                key={i} cx={cx} cy={cy} r={isHovered ? 6 : 4}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.45}
                stroke={color}
                strokeOpacity={isHovered ? 1 : 0.8}
                strokeWidth={isHovered ? 2 : 0}
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