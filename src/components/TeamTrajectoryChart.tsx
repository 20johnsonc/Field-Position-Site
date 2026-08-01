import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  type Plugin,
} from 'chart.js';
import type { TrajectoryPoint, GameLogEntry } from '../lib/types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip);

interface Props {
  team: string;
  trajectory: TrajectoryPoint[];
  gameLog: GameLogEntry[];
}

export default function TeamTrajectoryChart({ team, trajectory, gameLog }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trajectory.length) return;

    const sorted = [...trajectory].sort((a, b) => a.week - b.week);
    const gameByWeek = new Map(gameLog.map((g) => [g.week, g]));
    const labels = sorted.map((p) => p.week);
    const offValues = sorted.map((p) => p.adj_off_ppa);

    const maxMargin = Math.max(1, ...gameLog.map((g) => Math.abs(g.margin)));
    const pointColors = sorted.map((p) => {
      const g = gameByWeek.get(p.week);
      if (!g) return 'rgba(59, 130, 246, 0.6)';
      return g.win ? '#22c55e' : '#ef4444';
    });
    const pointRadii = sorted.map((p) => {
      const g = gameByWeek.get(p.week);
      if (!g) return 3;
      return 6 + (Math.abs(g.margin) / maxMargin) * 14;
    });

    chartRef.current?.destroy();
    Chart.getChart(canvas)?.destroy();

    const labelPlugin: Plugin<'line'> = {
      id: 'gameLabels',
      afterDatasetsDraw(chartInstance) {
        const { ctx } = chartInstance;
        const meta = chartInstance.getDatasetMeta(0);
        ctx.save();
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = '#e5e7eb';
        ctx.textAlign = 'center';
        meta.data.forEach((point, index) => {
          const g = gameByWeek.get(sorted[index].week);
          if (!g) return;
          const label = `${g.opponent} (${g.margin > 0 ? '+' : ''}${g.margin})`;
          ctx.fillText(label, point.x, point.y - pointRadii[index] - 6);
        });
        ctx.restore();
      },
    };

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: `${team} Adj Off PPA`,
            data: offValues,
            borderColor: '#3b82f6',
            backgroundColor: pointColors,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointRadius: pointRadii,
            pointHoverRadius: pointRadii.map((r) => r + 2),
            borderWidth: 2,
            tension: 0.25,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 40 } },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { family: 'sans-serif', size: 12 } } },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#f3f4f6',
            bodyColor: '#e5e7eb',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: (items) => `Week ${items[0].label}`,
              label: (context) => {
                const g = gameByWeek.get(sorted[context.dataIndex].week);
                const base = `Adj Off PPA: ${offValues[context.dataIndex].toFixed(3)}`;
                return g ? [base, `vs ${g.opponent} (${g.win ? 'W' : 'L'} ${g.margin > 0 ? '+' : ''}${g.margin})`] : base;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Week', color: '#9ca3af' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#6b7280' },
          },
          y: {
            title: { display: true, text: 'Opponent-Adjusted EPA / Rating', color: '#9ca3af' },
            grid: { color: (c) => (c.tick.value === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)') },
            ticks: { color: '#6b7280' },
          },
        },
      },
      plugins: [labelPlugin],
    });

    return () => chartRef.current?.destroy();
  }, [team, trajectory, gameLog]);

  if (!trajectory.length) {
    return <div className="empty">No weekly trajectory data available for {team}.</div>;
  }

  return (
    <div className="chart-container" style={{ position: 'relative', height: '420px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}