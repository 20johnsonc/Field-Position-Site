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
  adj_off_ppa?: number;
  adj_def_value?: number;
  raw_off_ppa: number;
  raw_def_ppa: number;
  fbs_avg_ppa?: number;
  is_playoff?: boolean;
  round_name?: string | null;
  bowl_name?: string | null;
}

export interface GameLogEntry {
  week: number;
  opponent: string;
  location: 'Home' | 'Away';
  actual_margin: number;
  predicted_margin: number;
  beat_expectation_by: number;
  result: 'W' | 'L';
  is_playoff?: boolean;
  round_name?: string | null;
  bowl_name?: string | null;
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

    const maxRegularWeek = Math.max(12, ...trajectory.map(w => w.week));
    const minWeek = Math.min(0, ...trajectory.map(w => w.week), ...games.map(g => g.week));

    const sortedWeeks = [...trajectory].sort((a, b) => a.week - b.week);
    let currentPostWeek = maxRegularWeek + 1;

    const processedWeeks = sortedWeeks.map((w) => {
      const isPost = (w.is_playoff || w.bowl_name || w.round_name) && w.week <= 1;
      const effectiveWeek = isPost ? currentPostWeek++ : w.week;
      return { ...w, effectiveWeek };
    });

    const efficiencyByWeek = new Map<number, number>();
    processedWeeks.forEach((w) => {
      efficiencyByWeek.set(w.effectiveWeek, w.raw_off_ppa - w.raw_def_ppa);
    });

    const adjLinePoints = processedWeeks
      .filter((w) => w.adj_off_ppa != null && w.adj_def_value != null)
      .map((w) => ({
        x: w.effectiveWeek,
        y: (w.adj_off_ppa ?? 0) - (w.adj_def_value ?? 0),
      }));

    const fbsLinePoints = processedWeeks
      .filter((w) => w.fbs_avg_ppa != null)
      .map((w) => ({
        x: w.effectiveWeek,
        y: w.fbs_avg_ppa ?? 0,
      }));

    let gamePostWeek = maxRegularWeek + 1;
    const gameWeekMap = new Map<number, number>();
    games.forEach((g) => {
      const isPost = (g.is_playoff || g.bowl_name || g.round_name) && g.week <= 1;
      if (isPost) {
        gameWeekMap.set(JSON.stringify({ week: g.week, opp: g.opponent }), gamePostWeek++);
      }
    });

    const maxBeatExp = Math.max(1, ...games.map((g) => Math.abs(g.beat_expectation_by ?? 0)));

    const gameBubbles = games
      .map((g) => {
        const isPost = (g.is_playoff || g.bowl_name || g.round_name) && g.week <= 1;
        const effWeek = isPost ? (gameWeekMap.get(JSON.stringify({ week: g.week, opp: g.opponent })) ?? g.week) : g.week;
        
        if (!efficiencyByWeek.has(effWeek)) return null;

        const mag = Math.abs(g.beat_expectation_by ?? 0);
        return {
          game: g,
          x: effWeek,
          y: efficiencyByWeek.get(effWeek)!,
          r: 5 + (mag / maxBeatExp) * 16,
        };
      })
      .filter(Boolean) as { game: GameLogEntry; x: number; y: number; r: number }[];

    const allWeeks = [
      ...processedWeeks.map(w => w.effectiveWeek),
      ...gameBubbles.map(b => b.x),
      12
    ];
    const chartXMin = minWeek;
    const chartXMax = Math.max(...allWeeks);

    const allValues: number[] = [
      ...adjLinePoints.map(p => p.y),
      ...fbsLinePoints.map(p => p.y),
      ...gameBubbles.map(b => b.y),
      yMin,
      yMax
    ];
    const dynamicMin = Math.min(...allValues);
    const dynamicMax = Math.max(...allValues);
    const padding = Math.max(0.15, (dynamicMax - dynamicMin) * 0.15);

    const chartYMin = dynamicMin - padding;
    const chartYMax = dynamicMax + padding;

    return { adjLinePoints, fbsLinePoints, gameBubbles, chartYMin, chartYMax, chartXMin, chartXMax };
  }, [trajectory, games, yMin, yMax]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const { adjLinePoints, fbsLinePoints, gameBubbles, chartYMin, chartYMax } = chartData;

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            type: 'line',
            label: 'Adjusted PPA',
            data: adjLinePoints,
            borderColor: '#a855f7',
            borderWidth: 2.5,
            tension: 0.2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 2,
            parsing: false,
          },
          {
            type: 'line',
            label: 'FBS Average',
            data: fbsLinePoints,
            borderColor: '#9ca3af',
            borderWidth: 1.5,
            borderDash: [4, 4],
            tension: 0.2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 3,
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
                if (items[0].datasetIndex === 2) {
                  const g = gameBubbles[idx].game;
                  const label = g.bowl_name || g.round_name || (g.is_playoff ? 'Playoff Game' : `Week ${g.week}`);
                  return `${label}: vs ${g.opponent}`;
                }
                return `Week ${items[0].parsed.x}`;
              },
              label: (context) => {
                if (context.datasetIndex === 2) {
                  const g = gameBubbles[context.dataIndex].game;
                  const tooltipLines = [
                    `Result: ${g.result} (${g.location})`,
                    `Actual Margin: ${g.actual_margin > 0 ? '+' : ''}${g.actual_margin}`
                  ];

                  if (g.predicted_margin != null) {
                    tooltipLines.push(`Expected Margin: ${g.predicted_margin > 0 ? '+' : ''}${g.predicted_margin.toFixed(1)}`);
                  }
                  
                  if (g.beat_expectation_by != null) {
                    tooltipLines.push(`Beat Expectation: ${g.beat_expectation_by > 0 ? '+' : ''}${g.beat_expectation_by.toFixed(1)}`);
                  }

                  return tooltipLines;
                }
                return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`;
              },
            },
          },
        },
        scales: {
          y: {
            min: chartYMin,
            max: chartYMax,
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
            title: { display: true, text: 'Net PPA (Off - Def)', color: '#9ca3af' },
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