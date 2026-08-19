import React, { useEffect, useMemo, useRef } from 'react';
import {
  Chart,
  LineController,
  BubbleController,
  LineElement,
  PointElement,
  LinearScale,
  Legend,
  Tooltip,
} from 'chart.js';

Chart.register(
  LineController,
  BubbleController,
  LineElement,
  PointElement,
  LinearScale,
  Legend,
  Tooltip
);

export interface WeeklyEfficiencyEntry {
  week: number;
  adj_off_ppa: number;
  adj_def_value: number;
}

export interface GameLogEntry {
  week: number;
  opponent: string;
  location: 'Home' | 'Away';
  actual_margin: number;
  predicted_margin: number;
  beat_expectation_by: number;
  result: 'W' | 'L';
}

interface Props {
  team: string;
  trajectory: WeeklyEfficiencyEntry[];
  games: GameLogEntry[];
  yMin: number;
  yMax: number;
}

export default function TeamTrajectoryChart({ team, trajectory = [], games = [], yMin, yMax }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = useMemo(() => {
    if (!trajectory.length) return null;

    const sortedWeeks = [...trajectory].sort((a, b) => a.week - b.week);
    const efficiencyByWeek = new Map<number, number>();
    sortedWeeks.forEach((w) => {
      efficiencyByWeek.set(w.week, w.adj_off_ppa + w.adj_def_value);
    });

    const linePoints = sortedWeeks.map((w) => ({
      x: w.week,
      y: w.adj_off_ppa + w.adj_def_value,
    }));

    const maxBeatExp = Math.max(1, ...games.map((g) => Math.abs(g.beat_expectation_by ?? 0)));

    // Only plot games whose week exists in the efficiency trajectory
    const gameBubbles = games
      .filter((g) => efficiencyByWeek.has(g.week))
      .map((g) => {
        const mag = Math.abs(g.beat_expectation_by ?? 0);
        return {
          game: g,
          x: g.week,
          y: efficiencyByWeek.get(g.week)!,
          r: 5 + (mag / maxBeatExp) * 16,
        };
      });

    return { linePoints, gameBubbles };
  }, [trajectory, games]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const { linePoints, gameBubbles } = chartData;

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            type: 'line',
            label: 'Efficiency (Off PPA + Def PPA)',
            data: linePoints,
            borderColor: '#3b82f6',
            borderWidth: 2,
            tension: 0.2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 2,
            parsing: false,
          },
          {
            type: 'bubble',
            label: 'Game Result (size = Beat Expectation)',
            data: gameBubbles.map((b) => ({ x: b.x, y: b.y, r: b.r })),
            backgroundColor: gameBubbles.map((b) =>
              b.game.result === 'W' ? 'rgba(34, 197, 94, 0.75)' : 'rgba(239, 68, 68, 0.75)'
            ),
            borderColor: gameBubbles.map((b) => (b.game.result === 'W' ? '#15803d' : '#b91c1c')),
            borderWidth: 2,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 20, bottom: 10 } },
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 12 } } },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#f3f4f6',
            bodyColor: '#e5e7eb',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                if (items[0].datasetIndex === 1) {
                  const g = gameBubbles[idx].game;
                  return `Week ${g.week}: vs ${g.opponent}`;
                }
                return `Week ${linePoints[idx].x}`;
              },
              label: (context) => {
                if (context.datasetIndex === 1) {
                  const g = gameBubbles[context.dataIndex].game;
                  return [
                    `Result: ${g.result} (${g.location})`,
                    `Actual Margin: ${g.actual_margin > 0 ? '+' : ''}${g.actual_margin}`,
                    `Expected Margin: ${g.predicted_margin > 0 ? '+' : ''}${g.predicted_margin.toFixed(1)}`,
                    `Beat Expectation: ${g.beat_expectation_by > 0 ? '+' : ''}${g.beat_expectation_by.toFixed(1)}`,
                  ];
                }
                return `Efficiency: ${context.parsed.y.toFixed(3)}`;
              },
            },
          },
        },
        scales: {
          y: {
            min: yMin - (yMax -yMin) * 0.05,
            max: yMax + (yMax - yMin) * 0.05,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: { display: true, text: 'Efficiency (Adj Off PPA + Adj Def PPA)', color: '#9ca3af' },
          },
          x: {
            type: 'linear',
            grid: { color: '#374151' },
            ticks: {
              color: '#9ca3af',
              stepSize: 1,
              callback: (value: number) => `Wk ${value}`,
            },
            title: { display: true, text: 'Schedule Week', color: '#9ca3af' },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [chartData]);

  if (!trajectory.length) {
    return <div className="empty text-gray-500">No game trajectory data available for {team}.</div>;
  }

  return (
    <div className="chart-container w-full" style={{ position: 'relative', height: '420px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}