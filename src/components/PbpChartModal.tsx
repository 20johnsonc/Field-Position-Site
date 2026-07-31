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
} from 'chart.js';
import type { PbpPoint } from '../lib/types';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
);

interface ModalDetail {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
}

async function loadPbpData(gameId: string): Promise<PbpPoint[]> {
  const candidates = [`/pbp/pbp_${gameId}.json`, `/pbp/${gameId}.json`];

  for (const url of candidates) {
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    }
  }

  throw new Error(`Play-by-play data not found for game ${gameId}`);
}

export default function PbpChartModal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('Game Flow & Momentum');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleOpen = async (event: Event) => {
      const detail = (event as CustomEvent<ModalDetail>).detail;
      if (!detail) return;

      setIsOpen(true);
      setLoading(true);
      setError(null);
      setTitle(`${detail.awayTeam} @ ${detail.homeTeam} — Game Flow & Momentum`);

      try {
        const pbpData = await loadPbpData(detail.gameId);
        const canvas = canvasRef.current;
        if (!canvas) return;

        chartRef.current?.destroy();

        const ppaValues = pbpData.map((point) =>
          Number(point.cum_ppa ?? point.cum_net_ppa ?? point.net_ppa ?? point.ppa ?? 0),
        );
        const scoreDiffValues = pbpData.map((point) =>
          Number(point.score_diff ?? point.margin ?? 0),
        );
        const labels = pbpData.map((point, index) => point.play_number ?? point.play_num ?? index + 1);

        const maxPpa = Math.max(1, ...ppaValues.map(Math.abs));
        const maxDiff = Math.max(1, ...scoreDiffValues.map(Math.abs));

        chartRef.current = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Net Momentum Advantage',
                data: ppaValues,
                borderColor: '#3b82f6',
                borderWidth: 2.5,
                fill: false,
                tension: 0.1,
                yAxisID: 'y',
              },
              {
                label: 'Actual Score Lead',
                data: scoreDiffValues,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 4],
                fill: false,
                tension: 0,
                yAxisID: 'y1',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                type: 'linear',
                position: 'left',
                min: -(maxPpa * 1.2),
                max: maxPpa * 1.2,
              },
              y1: {
                type: 'linear',
                position: 'right',
                min: -(maxDiff * 1.2),
                max: maxDiff * 1.2,
                grid: {
                  drawOnChartArea: false,
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

  const closeModal = () => {
    setIsOpen(false);
    setError(null);
    chartRef.current?.destroy();
    chartRef.current = null;
  };

  return (
    <div className={`modal${isOpen ? ' active' : ''}`} onClick={(event) => {
      if (event.target === event.currentTarget) closeModal();
    }}>
      <div className="modal-content">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="close-btn" onClick={closeModal} aria-label="Close chart">
            &times;
          </button>
        </div>
        <div className="chart-container">
          {loading && <div className="empty">Loading play-by-play data…</div>}
          {!loading && error && <div className="empty">{error}</div>}
          <canvas ref={canvasRef} style={{ display: loading || error ? 'none' : 'block' }} />
        </div>
      </div>
    </div>
  );
}
