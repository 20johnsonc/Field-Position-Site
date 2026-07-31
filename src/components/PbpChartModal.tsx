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
import type { PbpPoint } from '../lib/types';

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

async function loadPbpData(gameId: string, year: string | number): Promise<PbpPoint[]> {
  // Update candidate URLs to match the new public path structure
  const candidates = [
    `/pbp/${year}/${gameId}.json`,
  ];

  for (const url of candidates) {
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    }
  }

  throw new Error(`Play-by-play data not found for game ${gameId} (${year})`);
}

export default function PbpChartModal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('Game Flow & Expected Points');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [pbpPoints, setPbpPoints] = useState<PbpPoint[]>([]);
  const [activePlay, setActivePlay] = useState<PbpPoint | null>(null);

  const closeModal = () => {
    setIsOpen(false);
    setError(null);
    setActivePlay(null);
    setPbpPoints([]);
    chartRef.current?.destroy();
    chartRef.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    const handleOpen = async (event: Event) => {
      const detail = (event as CustomEvent<ModalDetail>).detail;
      if (!detail) return;

      setIsOpen(true);
      setLoading(true);
      setError(null);
      setActivePlay(null);
      setTitle(`${detail.awayTeam} @ ${detail.homeTeam} — Game Flow & Expected Points`);

      try {
        const pbpData = await loadPbpData(detail.gameId, detail.year);
        setPbpPoints(pbpData);

        const canvas = canvasRef.current;
        if (!canvas) return;

        chartRef.current?.destroy();

        // Data extraction
        const ppaValues = pbpData.map((point) =>
          Number(point.cum_net_ppa ?? point.cum_ppa ?? point.net_ppa ?? point.ppa ?? 0)
        );
        const scoreDiffValues = pbpData.map((point) =>
          Number(point.score_diff ?? point.margin ?? 0)
        );
        const labels = pbpData.map(
          (point, index) => point.play_number ?? point.play_num ?? index + 1
        );

        const maxPpa = Math.max(1, ...ppaValues.map(Math.abs));
        const maxDiff = Math.max(1, ...scoreDiffValues.map(Math.abs));

        chartRef.current = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Cumulative Expected Points Added (EPA)',
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
            interaction: {
              mode: 'index',
              intersect: false,
            },
            onHover: (_event, activeElements: ActiveElement[]) => {
              if (activeElements.length > 0) {
                const dataIndex = activeElements[0].index;
                setActivePlay(pbpData[dataIndex] ?? null);
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

                    // Score Lead dataset
                    if (context.datasetIndex === 1) {
                      const scoreDiff = Number(point?.score_diff ?? point?.margin ?? 0);
                      const awayScore = Number(point?.away_score ?? point?.awayScore ?? 0);
                      
                      // Calculate home score based on score_diff if explicit field is missing
                      const homeScore =
                        point?.home_score ?? point?.homeScore ?? awayScore - scoreDiff;

                      return `Score: ${detail.awayTeam} ${awayScore} - ${homeScore} ${detail.homeTeam}`;
                    }

                    // EPA dataset: display specific play added (net_ppa / ppa)
                    const playEpa = Number(point?.net_ppa ?? point?.ppa ?? 0);
                    return `Play EPA: ${playEpa > 0 ? '+' : ''}${playEpa.toFixed(2)}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: {
                  color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                  color: '#6b7280',
                  maxRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: 12,
                },
              },
              y: {
                type: 'linear',
                position: 'left',
                min: -(maxPpa * 1.15),
                max: maxPpa * 1.15,
                grid: {
                  color: (context) =>
                    context.tick.value === 0
                      ? 'rgba(255, 255, 255, 0.25)'
                      : 'rgba(255, 255, 255, 0.05)',
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
                grid: {
                  drawOnChartArea: false,
                },
                ticks: {
                  color: '#ef4444',
                  precision: 0,
                },
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

  const getDownDistance = (p: PbpPoint) => {
    const down = p.down ?? p.down_number;
    const distance = p.distance ?? p.ydstogo;
    if (!down) return null;
    return `${down}${getOrdinalSuffix(Number(down))} & ${distance}`;
  };

  const getClock = (p: PbpPoint) => {
    const qtr = p.period ?? p.quarter ?? p.qtr;
    const clock = p.clock ?? p.time;
    if (!qtr) return null;
    return `Q${qtr} ${clock ? `• ${clock}` : ''}`;
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

        {/* Play Context Footer */}
        {!loading && !error && pbpPoints.length > 0 && (
          <div className="play-detail-card" style={detailCardStyle}>
            {activePlay ? (
              <>
                <div style={detailMetaStyle}>
                  {getClock(activePlay) && <span style={badgeStyle}>{getClock(activePlay)}</span>}
                  {getDownDistance(activePlay) && (
                    <span style={badgeStyle}>{getDownDistance(activePlay)}</span>
                  )}
                  {(activePlay.yard_line || activePlay.location) && (
                    <span style={badgeStyle}>
                      Ball on {activePlay.yard_line ?? activePlay.location}
                    </span>
                  )}
                </div>
                <div style={detailTextStyle}>
                  {activePlay.playText ??
                    activePlay.play_text ??
                    activePlay.description ??
                    activePlay.text ??
                    'No play description available.'}
                </div>
              </>
            ) : (
              <div style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center' }}>
                Hover over any point on the chart to inspect play details
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
  minHeight: '72px',
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
