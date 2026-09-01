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
import { type PbpPoint } from '../lib/pbp';
import { loadPbpData } from '../lib/pbpClient';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip
);

interface ModalDetail {
  gameId: string;
  year: string | number;
  homeTeam: string;
  awayTeam: string;
}

// Cumulative scores should only change on the play that actually scores.
// Trusts the feed's own `scoring` flag: holds the last confirmed score on
// every non-scoring play, and only accepts a new value when the play is
// explicitly marked as a scoring play. Works regardless of whether a bad
// reading is too high or too low, and regardless of how many consecutive
// plays it corrupts.
function sanitizeScoreSeries(
  homeRaw: number[],
  awayRaw: number[],
  scoringFlags: boolean[]
): { home: number[]; away: number[] } {
  const n = homeRaw.length;
  const homeClean: number[] = new Array(n);
  const awayClean: number[] = new Array(n);

  let lastHome = homeRaw[0] ?? 0;
  let lastAway = awayRaw[0] ?? 0;

  for (let i = 0; i < n; i++) {
    if (scoringFlags[i]) {
      lastHome = homeRaw[i];
      lastAway = awayRaw[i];
    } else if (homeRaw[i] !== lastHome || awayRaw[i] !== lastAway) {
      console.warn(
        `Discarded score glitch at index ${i}: reported ${homeRaw[i]}-${awayRaw[i]}, kept ${lastHome}-${lastAway} (scoring=false)`
      );
    }
    homeClean[i] = lastHome;
    awayClean[i] = lastAway;
  }

  return { home: homeClean, away: awayClean };
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
  };

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

  // Fetches data only — never touches the canvas or Chart.js here.
  useEffect(() => {
    const handleOpen = async (event: Event) => {
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
      } catch (loadError) {
        console.error(loadError);
        setError('Play-by-play data not available for this game.');
        setPbpPoints([]);
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener('open-pbp-modal', handleOpen);
    return () => {
      window.removeEventListener('open-pbp-modal', handleOpen);
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  // Builds/rebuilds the chart whenever fresh data arrives while open.
  // Runs after React has committed the <canvas> to the DOM, so a fast
  // cache hit on reopen can't race ahead of the canvas mounting.
  useEffect(() => {
    if (!isOpen || pbpPoints.length === 0) return;

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

    const ppaValues = pbpPoints.map((point) => Number(point.cum_net_ppa ?? 0));

    const homeScoresRaw = pbpPoints.map((point) =>
      point.offense === point.home ? point.offenseScore : point.defenseScore
    );
    const awayScoresRaw = pbpPoints.map((point) =>
      point.offense === point.away ? point.offenseScore : point.defenseScore
    );
    const scoringFlags = pbpPoints.map((point) => Boolean(point.scoring));

    const { home: homeScoresClean, away: awayScoresClean } = sanitizeScoreSeries(
      homeScoresRaw,
      awayScoresRaw,
      scoringFlags
    );

    const scoreDiffValues = homeScoresClean.map((h, i) => h - awayScoresClean[i]);
    const labels = pbpPoints.map((point) => point.playNumber);

    const maxPpa = Math.max(1, ...ppaValues.map(Math.abs));
    const maxDiff = Math.max(1, ...scoreDiffValues.map(Math.abs));

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cumulative PPA',
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
        animation: false,
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
                const point = pbpPoints[dataIndex];

                if (context.datasetIndex === 1) {
                  return `Score: ${point.away} ${awayScoresClean[dataIndex]} - ${homeScoresClean[dataIndex]} ${point.home}`;
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

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [pbpPoints, isOpen]);

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
              🔥 Big Play — {p.offense} ({ppa.toFixed(2)})
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
              🔥 Big Play — {p.offense} ({ppa.toFixed(2)})
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
      {isOpen && (
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
      )}
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