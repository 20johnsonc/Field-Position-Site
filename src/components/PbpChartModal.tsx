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
// explicitly marked as a scoring play.
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

  return {
    home: homeClean,
    away: awayClean,
  };
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
  const [themeVersion, setThemeVersion] = useState(0);

  /*
   * Read a CSS custom property from the document.
   * Chart.js needs actual color strings rather than var(--foo).
   */
  const getThemeColor = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;

    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

    return value || fallback;
  };

  /*
   * Rebuild the chart when the application theme changes.
   */
  useEffect(() => {
    const handleThemeChange = () => {
      setThemeVersion((version) => version + 1);
    };

    window.addEventListener('themechange', handleThemeChange);

    return () => {
      window.removeEventListener('themechange', handleThemeChange);
    };
  }, []);

  /*
   * Close modal and reset transient state.
   */
  const closeModal = () => {
    setIsOpen(false);
    setError(null);
    setActivePlayIndex(null);
    setPbpPoints([]);
  };

  /*
   * Keyboard navigation.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        closeModal();
        return;
      }

      if (pbpPoints.length === 0) return;

      if (event.key === 'ArrowRight') {
        setActivePlayIndex((previous) => {
          if (previous === null) return 0;
          return Math.min(previous + 1, pbpPoints.length - 1);
        });
      }

      if (event.key === 'ArrowLeft') {
        setActivePlayIndex((previous) => {
          if (previous === null) return 0;
          return Math.max(previous - 1, 0);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, pbpPoints.length]);

  /*
   * Synchronize keyboard-selected play with the Chart.js hover state.
   */
  useEffect(() => {
    if (
      !chartRef.current ||
      activePlayIndex === null ||
      activePlayIndex < 0 ||
      activePlayIndex >= pbpPoints.length
    ) {
      return;
    }

    const activeElements: ActiveElement[] = [
      {
        datasetIndex: 0,
        index: activePlayIndex,
      },
      {
        datasetIndex: 1,
        index: activePlayIndex,
      },
    ];

    chartRef.current.setActiveElements(activeElements);

    chartRef.current.tooltip?.setActiveElements(activeElements, {
      x: 0,
      y: 0,
    });

    chartRef.current.update();
  }, [activePlayIndex, pbpPoints.length]);

  /*
   * Listen for the global open-pbp-modal event and fetch the data.
   *
   * This effect only handles opening/loading data.
   * Chart.js is handled separately after React commits the canvas.
   */
  useEffect(() => {
    const handleOpen = async (event: Event) => {
      const detail = (event as CustomEvent<ModalDetail>).detail;

      if (!detail || !detail.gameId) return;

      setIsOpen(true);
      setLoading(true);
      setError(null);
      setActivePlayIndex(null);
      setPbpPoints([]);

      setTitle(
        `${detail.awayTeam} @ ${detail.homeTeam} — Game Flow & Expected Points`
      );

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

  /*
   * Build/rebuild the Chart.js instance whenever:
   * - the modal opens
   * - fresh PBP data arrives
   * - the theme changes
   */
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

    const ppaValues = pbpPoints.map((point) =>
      Number(point.cum_net_ppa ?? 0)
    );

    const homeScoresRaw = pbpPoints.map((point) =>
      point.offense === point.home
        ? point.offenseScore
        : point.defenseScore
    );

    const awayScoresRaw = pbpPoints.map((point) =>
      point.offense === point.away
        ? point.offenseScore
        : point.defenseScore
    );

    const scoringFlags = pbpPoints.map((point) =>
      Boolean(point.scoring)
    );

    const {
      home: homeScoresClean,
      away: awayScoresClean,
    } = sanitizeScoreSeries(
      homeScoresRaw,
      awayScoresRaw,
      scoringFlags
    );

    const scoreDiffValues = homeScoresClean.map(
      (homeScore, index) =>
        homeScore - awayScoresClean[index]
    );

    const labels = pbpPoints.map(
      (point) => point.playNumber
    );

    const maxPpa = Math.max(
      1,
      ...ppaValues.map(Math.abs)
    );

    const maxDiff = Math.max(
      1,
      ...scoreDiffValues.map(Math.abs)
    );

    /*
     * Theme-aware Chart.js colors.
     */
    const accentInfo = getThemeColor(
      '--accent-info',
      '#60a5fa'
    );

    const accentDanger = getThemeColor(
      '--accent-danger',
      '#ef4444'
    );

    const accentDangerLight = getThemeColor(
      '--loss-text',
      '#f87171'
    );

    const textMuted = getThemeColor(
      '--text-muted',
      '#94a3b8'
    );

    const chartGrid = getThemeColor(
      '--chart-grid',
      'rgba(255, 255, 255, 0.05)'
    );

    const chartGridStrong = getThemeColor(
      '--chart-grid-strong',
      'rgba(255, 255, 255, 0.25)'
    );

    const surface3 = getThemeColor(
      '--surface-3',
      '#1f2937'
    );

    const cardBorder = getThemeColor(
      '--card-border',
      '#374151'
    );

    const text = getThemeColor(
      '--text',
      '#f3f4f6'
    );

    chartRef.current = new Chart(canvas, {
      type: 'line',

      data: {
        labels,

        datasets: [
          {
            label: 'Cumulative PPA',
            data: ppaValues,
            borderColor: accentInfo,
            backgroundColor: accentInfo,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: accentInfo,
            fill: false,
            tension: 0.2,
            yAxisID: 'y',
          },

          {
            label: 'Actual Score Lead',
            data: scoreDiffValues,
            borderColor: accentDanger,
            backgroundColor: accentDanger,
            borderWidth: 2,
            borderDash: [5, 5],
            stepped: 'before',
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: accentDangerLight,
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
            setActivePlayIndex(
              activeElements[0].index
            );
          }
        },

        plugins: {
          legend: {
            labels: {
              color: textMuted,
              font: {
                family: 'sans-serif',
                size: 12,
              },
              usePointStyle: true,
              boxWidth: 8,
            },
          },

          tooltip: {
            backgroundColor: surface3,
            titleColor: text,
            bodyColor: text,
            borderColor: cardBorder,
            borderWidth: 1,
            padding: 10,

            callbacks: {
              title: (items) =>
                `Play #${items[0].label}`,

              label: (context) => {
                const dataIndex = context.dataIndex;
                const point = pbpPoints[dataIndex];

                if (!point) return '';

                if (context.datasetIndex === 1) {
                  return `Score: ${point.away} ${awayScoresClean[dataIndex]} - ${homeScoresClean[dataIndex]} ${point.home}`;
                }

                const playEpa = Number(
                  point.net_ppa ?? point.ppa ?? 0
                );

                return `Play EPA: ${
                  playEpa > 0 ? '+' : ''
                }${playEpa.toFixed(2)}`;
              },
            },
          },
        },

        scales: {
          x: {
            grid: {
              color: chartGrid,
            },

            ticks: {
              color: textMuted,
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
                  ? chartGridStrong
                  : chartGrid,
            },

            ticks: {
              color: accentInfo,

              callback: (value) =>
                Number(value).toFixed(1),
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
              color: accentDanger,
              precision: 0,
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [pbpPoints, isOpen, themeVersion]);

  const activePlay =
    activePlayIndex !== null
      ? pbpPoints[activePlayIndex]
      : null;

  const getOrdinalSuffix = (value: number) => {
    const j = value % 10;
    const k = value % 100;

    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';

    return 'th';
  };

  const getDownDistance = (point: PbpPoint) => {
    if (!point.down) return null;

    return `${point.down}${getOrdinalSuffix(
      point.down
    )} & ${point.distance}`;
  };

  const getClock = (point: PbpPoint) => {
    if (!point.period) return null;

    const clockStr =
      typeof point.clock === 'object' &&
      point.clock !== null
        ? point.clock.displayValue
        : point.clock;

    return `Q${point.period}${
      clockStr ? ` • ${clockStr}` : ''
    }`;
  };

  const getFieldPosition = (point: PbpPoint) => {
    if (
      point.yardsToGoal !== undefined &&
      point.yardsToGoal !== null
    ) {
      if (point.yardsToGoal === 50) {
        return 'Ball on 50';
      }

      return point.yardsToGoal < 50
        ? `Opp ${point.yardsToGoal}`
        : `Own ${100 - point.yardsToGoal}`;
    }

    if (
      point.yardline !== undefined &&
      point.yardline !== null
    ) {
      if (point.yardline === 50) {
        return 'Ball on 50';
      }

      return point.yardline > 50
        ? `Opp ${100 - point.yardline}`
        : `Own ${point.yardline}`;
    }

    return null;
  };

  const getPossession = (point: PbpPoint) => {
    return point.offense
      ? `Poss: ${point.offense}`
      : null;
  };

  const getEpaBadge = (point: PbpPoint) => {
    const ppa = Number(
      point.net_ppa ?? point.ppa ?? 0
    );

    if (ppa >= 1.5) {
      if (point.offense === point.home) {
        return (
          <span className="play-detail-badge epa-offense">
            🔥 Big Play — {point.offense} (
            {ppa.toFixed(2)})
          </span>
        );
      }

      return (
        <span className="play-detail-badge epa-defense">
          🛡️ Big Play — {point.defense} (
          {ppa.toFixed(2)})
        </span>
      );
    }

    if (ppa <= -1.5) {
      if (point.offense === point.home) {
        return (
          <span className="play-detail-badge epa-defense">
            🛡️ Big Play — {point.defense} (
            {ppa.toFixed(2)})
          </span>
        );
      }

      return (
        <span className="play-detail-badge epa-offense">
          🔥 Big Play — {point.offense} (
          {ppa.toFixed(2)})
        </span>
      );
    }

    return null;
  };

  const formatPlayText = (playText: string) => {
    const keywordPattern =
      /\b(TOUCHDOWN|INTERCEPTED|FUMBLE|SACKED|PASSED|RUSHED|SAFETY|FIELD GOAL|TURNOVER)\b/i;

    return playText
      .split(keywordPattern)
      .map((part, index) =>
        keywordPattern.test(part) ? (
          <strong key={index}>{part}</strong>
        ) : (
          part
        )
      );
  };

  return (
    <div
      className={`modal${isOpen ? ' active' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
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

          <div className="chart-container pbp-chart-wrap">
            {loading && (
              <div className="empty pbp-status">
                Loading play-by-play data…
              </div>
            )}

            {!loading && error && (
              <div className="empty pbp-status pbp-status-error">
                {error}
              </div>
            )}

            <canvas
              ref={canvasRef}
              style={{
                display:
                  loading || error
                    ? 'none'
                    : 'block',
              }}
            />
          </div>

          {!loading &&
            !error &&
            pbpPoints.length > 0 && (
              <div className="play-detail-card">
                {activePlay ? (
                  <>
                    <div className="play-detail-meta">
                      {getClock(activePlay) && (
                        <span className="play-detail-badge">
                          {getClock(activePlay)}
                        </span>
                      )}

                      {getDownDistance(activePlay) && (
                        <span className="play-detail-badge">
                          {getDownDistance(activePlay)}
                        </span>
                      )}

                      {getFieldPosition(activePlay) && (
                        <span className="play-detail-badge">
                          {getFieldPosition(activePlay)}
                        </span>
                      )}

                      {getPossession(activePlay) && (
                        <span className="play-detail-badge">
                          {getPossession(activePlay)}
                        </span>
                      )}

                      {getEpaBadge(activePlay)}
                    </div>

                    <div className="play-detail-text">
                      {formatPlayText(
                        activePlay.playText ||
                          'No play description available.'
                      )}
                    </div>
                  </>
                ) : (
                  <div className="play-detail-empty">
                    Hover points or use{' '}
                    <kbd>←</kbd> / <kbd>→</kbd> arrow keys
                    to inspect play details
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}