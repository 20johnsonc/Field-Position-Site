import { useEffect, useRef, useState } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  type ActiveElement,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip
);

export interface PbpPoint {
  id: string;
  driveId: string;
  driveNumber: number;
  playNumber: number;
  home: string;
  away: string;
  offense: string;
  offenseConference?: string;
  defense: string;
  defenseConference?: string;
  offenseScore: number;
  defenseScore: number;
  score_diff: number;
  period: number;
  clock: string | { displayValue?: string };
  clock_seconds?: number;
  wallclock?: string;
  down: number;
  distance: number;
  yardline: number;
  yardsToGoal: number;
  yardsGained: number;
  scoring: boolean;
  playType: string;
  playText: string;
  ppa?: number;
  net_ppa?: number;
  cum_net_ppa: number;
}

interface ModalDetail {
  gameId: string;
  year: string | number;
  homeTeam: string;
  awayTeam: string;
}

// In-Memory Cache for low-latency re-opens
const pbpCache = new Map<string, PbpPoint[]>();

async function loadPbpData(gameId: string, year: string | number = '2025'): Promise<PbpPoint[]> {
  const isInvalidYear = typeof year === 'string' && /[a-zA-Z]/.test(year);
  const cleanYear = isInvalidYear || !year ? '2025' : String(year).trim();
  const cacheKey = `${cleanYear}_${gameId}`;

  if (pbpCache.has(cacheKey)) {
    return pbpCache.get(cacheKey)!;
  }

  const candidates = [
    `/pbp/${year}/${gameId}.json`,
    `/pbp/${cleanYear}/pbp_${gameId}.json`,
    `/pbp/${gameId}.json`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data: PbpPoint[] = await response.json();
        pbpCache.set(cacheKey, data);
        return data;
      }
    } catch {
      // Try next candidate path
    }
  }

  throw new Error(`Play-by-play data not found for game ${gameId} (${cleanYear})`);
}

export default function PbpChartModal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('Game Flow & Expected Points');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pbpPoints, setPbpPoints] = useState<PbpPoint[]>([]);
  const [activePlayIndex, setActivePlayIndex] = useState<number | null>(null);

  const closeModal = () => {
    setIsOpen(false);
    setError(null);
    setActivePlayIndex(null);
    setPbpPoints([]);
    chartRef.current?.destroy();
    chartRef.current = null;
  };

  // Keyboard Navigation: Escape to close, Left/Right arrows to step plays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'ArrowRight') {
        setActivePlayIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, pbpPoints.length - 1);
        });
      } else if (e.key === 'ArrowLeft') {
        setActivePlayIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pbpPoints.length]);

  // Programmatically highlight/hover point when using arrow keys
  useEffect(() => {
    if (chartRef.current && activePlayIndex !== null && activePlayIndex >= 0) {
      chartRef.current.setActiveElements([
        { datasetIndex: 0, index: activePlayIndex },
        { datasetIndex: 1, index: activePlayIndex },
      ]);
      chartRef.current.tooltip?.setActiveElements(
        [
          { datasetIndex: 0, index: activePlayIndex },
          { datasetIndex: 1, index: activePlayIndex },
        ],
        { x: 0, y: 0 }
      );
      chartRef.current.update();
    }
  }, [activePlayIndex]);

  useEffect(() => {
    const handleOpen = async (event: Event) => {
      console.log('open-pbp-modal received', event);

      const detail = (event as CustomEvent<ModalDetail>).detail;
      if (!detail || !detail.gameId) return;

      setIsOpen(true);
      setLoading(true);
      setError(null);
      setActivePlayIndex(null);
      setTitle(`${detail.awayTeam} @ ${detail.homeTeam} — Game Flow & Expected Points`);

      try {
        const pbpData = await loadPbpData(detail.gameId, detail.year);
        setPbpPoints(pbpData);

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }

        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
          existingChart.destroy();
        }

        const ppaValues = pbpData.map((point) => Number(point.cum_net_ppa ?? 0));
        const scoreDiffValues = pbpData.map((point) => {
          const homeScore = point.offense === point.home ? point.offenseScore : point.defenseScore;
          const awayScore = point.offense === point.away ? point.offenseScore : point.defenseScore;
          return homeScore - awayScore;
        });
        const labels = pbpData.map((point) => point.playNumber);

        const maxPpa = Math.max(1, ...ppaValues.map(Math.abs));
        const maxDiff = Math.max(1, ...scoreDiffValues.map(Math.abs));

        chartRef.current = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Cumulative EPA',
                data: ppaValues,
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f6',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#60a5fa',
                fill: false,
                tension: 0.2,
                yAxisID: 'y',
              },
              {
                label: 'Actual Score Lead',
                data: scoreDiffValues,
                borderColor: '#ef4444',
                backgroundColor: '#ef4444',
                borderWidth: 2,
                borderDash: [5, 5],
                stepped: 'before',
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#f87171',
                fill: false,
                yAxisID: 'y1',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Performance speedup
            interaction: {
              mode: 'index',
              intersect: false,
            },
            onHover: (_event, activeElements: ActiveElement[]) => {
              if (activeElements.length > 0) {
                setActivePlayIndex(activeElements[0].index);
              }
            },
            plugins: {
              legend: {
                labels: {
                  color: '#9ca3af',
                  font: { family: 'sans-serif', size: 12 },
                  usePointStyle: true,
                  boxWidth: 8,
                },
              },
              tooltip: {
                backgroundColor: '#1f2937',
                titleColor: '#f3f4f6',
                bodyColor: '#e5e7eb',
                borderColor: '#374151',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  title: (items) => `Play #${items[0].label}`,
                  label: (context) => {
                    const dataIndex = context.dataIndex;
                    const point = pbpData[dataIndex];

                    if (context.datasetIndex === 1) {
                      const homeScore = point.offense === point.home ? point.offenseScore : point.defenseScore;
                      const awayScore = point.offense === point.away ? point.offenseScore : point.defenseScore;
                      return `Score: ${point.away} ${awayScore} - ${homeScore} ${point.home}`;
                    }

                    const playEpa = Number(point.net_ppa ?? point.ppa ?? 0);
                    return `Play EPA: ${playEpa > 0 ? '+' : ''}${playEpa.toFixed(2)}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
              },
              y: {
                type: 'linear',
                position: 'left',
                min: -(maxPpa * 1.15),
                max: maxPpa * 1.15,
                grid: {
                  color: (context) =>
                    context.tick.value === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                  color: '#3b82f6',
                  callback: (val) => Number(val).toFixed(1),
                },
              },
              y1: {
                type: 'linear',
                position: 'right',
                min: -(maxDiff * 1.15),
                max: maxDiff * 1.15,
                grid: { drawOnChartArea: false },
                ticks: { color: '#ef4444', precision: 0 },
              },
            },
          },
        });
      } catch (loadError) {
        console.error(loadError);
        setError('Play-by-play data not available for this game.');
        chartRef.current?.destroy();
        chartRef.current = null;
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener('open-pbp-modal', handleOpen);
    return () => {
      window.removeEventListener('open-pbp-modal', handleOpen);
      chartRef.current?.destroy();
    };
  }, []);

  const activePlay = activePlayIndex !== null ? pbpPoints[activePlayIndex] : null;

  const getDownDistance = (p: PbpPoint) => {
    if (!p.down) return null;
    return `${p.down}${getOrdinalSuffix(p.down)} & ${p.distance}`;
  };

  const getClock = (p: PbpPoint) => {
    if (!p.period) return null;
    const clockStr =
      typeof p.clock === 'object' && p.clock !== null ? p.clock.displayValue : p.clock;
    return `Q${p.period}${clockStr ? ` • ${clockStr}` : ''}`;
  };

  const getFieldPosition = (p: PbpPoint) => {
    if (p.yardsToGoal !== undefined && p.yardsToGoal !== null) {
      if (p.yardsToGoal === 50) return 'Ball on 50';
      return p.yardsToGoal < 50 ? `Opp ${p.yardsToGoal}` : `Own ${100 - p.yardsToGoal}`;
    }
    if (p.yardline !== undefined && p.yardline !== null) {
      if (p.yardline === 50) return 'Ball on 50';
      return p.yardline > 50 ? `Opp ${100 - p.yardline}` : `Own ${p.yardline}`;
    }
    return null;
  };

  const getPossession = (p: PbpPoint) => {
    return p.offense ? `Poss: ${p.offense}` : null;
  };

  const getEpaBadge = (p: PbpPoint) => {
      const ppa = Number(p.net_ppa ?? p.ppa ?? 0);

      if (ppa >= 1.5) {
        if (p.offense === p.home){
          return (
            <span style={{ ...badgeStyle, backgroundColor: '#065f46', color: '#34d399', borderColor: '#047857' }}>
              🔥 Big Play — {p.offense} (+{ppa.toFixed(2)})
            </span>
          );
        }
        else {
          return (
            <span style={{ ...badgeStyle, backgroundColor: '#1e3a8a', color: '#93c5fd', borderColor: '#1d4ed8' }}>
              🛡️ Big Play — {p.defense} ({ppa.toFixed(2)})
            </span>
          );
        }
      }
      if (ppa <= -1.5) {
        if (p.offense === p.home){
          return (
            <span style={{ ...badgeStyle, backgroundColor: '#1e3a8a', color: '#93c5fd', borderColor: '#1d4ed8' }}>
              🛡️ Big Play — {p.defense} ({ppa.toFixed(2)})
            </span>
          );
        }
        else {
          return (
            <span style={{ ...badgeStyle, backgroundColor: '#065f46', color: '#34d399', borderColor: '#047857' }}>
              🔥 Big Play — {p.offense} (+{ppa.toFixed(2)})
            </span>
          );
        }
      }
      return null;
    };

  const formatPlayText = (text: string) => {
    const keywords = /\b(TOUCHDOWN|INTERCEPTED|FUMBLE|SACKED|PASSED|RUSHED|SAFETY|FIELD GOAL|TURNOVER)\b/gi;
    return text.split(keywords).map((part, index) =>
      keywords.test(part) ? (
        <strong key={index} style={{ color: '#60a5fa', fontWeight: 700 }}>
          {part}
        </strong>
      ) : (
        part
      )
    );
  };

  const getOrdinalSuffix = (i: number) => {
    const j = i % 10,
      k = i % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  };

  return (
    <div
      className={`modal${isOpen ? ' active' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="close-btn"
            onClick={closeModal}
            aria-label="Close chart"
          >
            &times;
          </button>
        </div>

        <div className="chart-container" style={{ position: 'relative', height: '360px' }}>
          {loading && <div className="empty">Loading play-by-play data…</div>}
          {!loading && error && <div className="empty">{error}</div>}
          <canvas
            ref={canvasRef}
            style={{ display: loading || error ? 'none' : 'block' }}
          />
        </div>

        {/* Enhanced Play Context Footer */}
        {!loading && !error && pbpPoints.length > 0 && (
          <div className="play-detail-card" style={detailCardStyle}>
            {activePlay ? (
              <>
                <div style={detailMetaStyle}>
                  {getClock(activePlay) && <span style={badgeStyle}>{getClock(activePlay)}</span>}
                  {getDownDistance(activePlay) && (
                    <span style={badgeStyle}>{getDownDistance(activePlay)}</span>
                  )}
                  {getFieldPosition(activePlay) && (
                    <span style={badgeStyle}>{getFieldPosition(activePlay)}</span>
                  )}
                  {getPossession(activePlay) && (
                    <span style={badgeStyle}>{getPossession(activePlay)}</span>
                  )}
                  {getEpaBadge(activePlay)}
                </div>
                <div style={detailTextStyle}>
                  {formatPlayText(activePlay.playText || 'No play description available.')}
                </div>
              </>
            ) : (
              <div style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>
                Hover points or use <kbd style={kbdStyle}>←</kbd> / <kbd style={kbdStyle}>→</kbd> arrow keys to inspect play details
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const detailCardStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '0.875rem 1rem',
  backgroundColor: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '0.5rem',
  minHeight: '76px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '0.5rem',
};

const detailMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'center',
};

const badgeStyle: React.CSSProperties = {
  backgroundColor: '#1f2937',
  color: '#60a5fa',
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.125rem 0.5rem',
  borderRadius: '0.25rem',
  border: '1px solid #374151',
};

const detailTextStyle: React.CSSProperties = {
  color: '#f3f4f6',
  fontSize: '0.875rem',
  lineHeight: '1.25rem',
};

const kbdStyle: React.CSSProperties = {
  backgroundColor: '#1f2937',
  color: '#9ca3af',
  padding: '0.1rem 0.35rem',
  borderRadius: '0.2rem',
  border: '1px solid #374151',
  fontSize: '0.75rem',
};