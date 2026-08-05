import React, { useEffect, useMemo, useRef } from 'react';
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

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip
);

export interface TrajectoryPoint {
  week: number;
  adj_off_ppa: number;
}

export interface GameHistoryEntry {
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
  trajectory: TrajectoryPoint[];
  gameHistory: GameHistoryEntry[];
}

export default function TeamTrajectoryChart({ team, trajectory = [], gameHistory = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = useMemo(() => {
    if (!trajectory.length) return null;

    // Sort trajectory to establish the continuous X-axis (including bye weeks)
    const sortedTrajectory = [...trajectory].sort((a, b) => a.week - b.week);
    const historyByWeek = new Map(gameHistory.map((g) => [g.week, g]));
    
    const maxMargin = Math.max(1, ...gameHistory.map((g) => Math.abs(g.actual_margin)));

    return {
      labels: sortedTrajectory.map((t) => t.week),
      offValues: sortedTrajectory.map((t) => t.adj_off_ppa),
      
      // Scatter arrays align with trajectory weeks; null if it was a bye week
      scatterValues: sortedTrajectory.map((t) => {
        const g = historyByWeek.get(t.week);
        return g ? g.beat_expectation_by : null;
      }),
      colors: sortedTrajectory.map((t) => {
        const g = historyByWeek.get(t.week);
        if (!g) return 'transparent';
        return g.result === 'W' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      }),
      borders: sortedTrajectory.map((t) => {
        const g = historyByWeek.get(t.week);
        if (!g) return 'transparent';
        return g.result === 'W' ? '#15803d' : '#b91c1c';
      }),
      radii: sortedTrajectory.map((t) => {
        const g = historyByWeek.get(t.week);
        if (!g) return 0;
        return 5 + (Math.abs(g.actual_margin) / maxMargin) * 13;
      }),
      sortedTrajectory,
      historyByWeek,
    };
  }, [trajectory, gameHistory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const {
      labels,
      offValues,
      scatterValues,
      colors,
      borders,
      radii,
      sortedTrajectory,
      historyByWeek
    } = chartData;

    // Plugin: Draws the opponent abbreviation and margin directly under the bubble
    const labelPlugin: Plugin<'line'> = {
      id: 'gameLabels',
      afterDatasetsDraw(chartInstance) {
        const { ctx } = chartInstance;
        const meta = chartInstance.getDatasetMeta(1); // Dataset 1 is the scatter bubbles
        if (!meta) return;

        ctx.save();
        ctx.font = '500 11px sans-serif';
        ctx.fillStyle = '#9ca3af'; // Gray text
        ctx.textAlign = 'center';

        meta.data.forEach((point, index) => {
          if (scatterValues[index] === null) return; // Skip bye weeks
          
          const g = historyByWeek.get(sortedTrajectory[index].week);
          if (!g) return;
          
          const text = `${g.opponent.substring(0, 3).toUpperCase()} (${g.actual_margin > 0 ? '+' : ''}${g.actual_margin})`;
          const offset = radii[index] + 12; // Push text below the dynamically sized circle
          ctx.fillText(text, point.x, point.y + offset);
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
            type: 'line',
            label: `${team} Adj Off PPA`,
            data: offValues,
            borderColor: '#3b82f6', // Blue trendline
            borderWidth: 3,
            tension: 0.3, // Smooth curve
            fill: false,
            pointRadius: 0, // Hide points on this line so bubbles stand out
            pointHoverRadius: 0,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Beat Expectation By',
            data: scatterValues,
            showLine: false, // Scatter plot style
            pointStyle: 'circle',
            pointBackgroundColor: colors,
            pointBorderColor: borders,
            pointBorderWidth: 2,
            pointRadius: radii,
            pointHoverRadius: radii.map((r) => (r > 0 ? r + 3 : 0)),
            yAxisID: 'y1',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 20, bottom: 20 },
        },
        plugins: {
          legend: { 
            labels: { color: '#9ca3af', font: { family: 'sans-serif', size: 12 } } 
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleColor: '#f3f4f6',
            bodyColor: '#e5e7eb',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              title: (items) => `Week ${items[0].label}`,
              label: (context) => {
                const index = context.dataIndex;
                
                // If hovering over the trendline
                if (context.datasetIndex === 0) {
                  return `Adj Off PPA: ${offValues[index].toFixed(3)}`;
                }
                
                // If hovering over a game bubble
                const g = historyByWeek.get(sortedTrajectory[index].week);
                if (!g) return '';

                return [
                  `${g.result} vs ${g.opponent}`,
                  `Actual Margin: ${g.actual_margin > 0 ? '+' : ''}${g.actual_margin}`,
                  `Expected Margin: ${g.predicted_margin > 0 ? '+' : ''}${g.predicted_margin.toFixed(1)}`,
                  `Performance vs Expectation: ${g.beat_expectation_by > 0 ? '+' : ''}${g.beat_expectation_by.toFixed(1)}`
                ];
              },
            },
          },
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Opponent-Adjusted EPA / Rating', color: '#9ca3af' },
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Points vs. Expectation', color: '#9ca3af' },
            grid: {
              drawOnChartArea: false, // Prevents overlapping grid lines from the two axes
            },
            ticks: { color: '#9ca3af' },
          },
          x: {
            title: { display: true, text: 'Week', color: '#9ca3af' },
            grid: { color: '#374151' },
            ticks: { color: '#9ca3af' },
          },
        },
      },
      plugins: [labelPlugin],
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [team, chartData]);

  if (!trajectory.length) {
    return <div className="empty text-gray-500">No trajectory data available for {team}.</div>;
  }

  return (
    <div className="chart-container w-full" style={{ position: 'relative', height: '420px' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}