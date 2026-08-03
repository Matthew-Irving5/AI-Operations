'use client';

import type { ECharts } from 'echarts';
import { useEffect, useMemo, useRef, useState } from 'react';

type Point = Readonly<{ createdAt: string; actual: number; estimated: number }>;
const periods = [
  ['7d', '7 days', 7],
  ['month', 'Month', 31],
  ['quarter', 'Quarter', 92],
  ['year', 'Year', 366],
] as const;

export function CostChart({ points }: Readonly<{ points: Point[] }>) {
  const [period, setPeriod] = useState<(typeof periods)[number][0]>('month');
  const container = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => {
    const days = periods.find((item) => item[0] === period)?.[2] ?? 31;
    const latest = Math.max(...points.map((point) => new Date(point.createdAt).getTime()));
    const threshold = latest - days * 86_400_000;
    return points.filter((point) => new Date(point.createdAt).getTime() >= threshold);
  }, [period, points]);
  useEffect(() => {
    if (!container.current) return;
    let chart: ECharts | undefined;
    let disposed = false;
    const element = container.current;
    const resize = new ResizeObserver(() => chart?.resize());
    resize.observe(element);
    void import('echarts').then((echarts) => {
      if (disposed) return;
      chart = echarts.init(element);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Actual', 'Estimated'], textStyle: { color: '#eef5ff' } },
        xAxis: {
          type: 'category',
          data: visible.map((point) =>
            new Date(point.createdAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }),
          ),
          axisLabel: { color: '#9fb0c8' },
        },
        yAxis: { type: 'value', axisLabel: { color: '#9fb0c8', formatter: '$ {value}' } },
        series: [
          { name: 'Actual', type: 'line', smooth: true, data: visible.map((point) => point.actual) },
          {
            name: 'Estimated',
            type: 'line',
            smooth: true,
            data: visible.map((point) => point.estimated),
          },
        ],
      });
    });
    return () => {
      disposed = true;
      resize.disconnect();
      chart?.dispose();
    };
  }, [visible]);
  return (
    <section className="card">
      <div className="periods" role="group" aria-label="Spend chart period">
        {periods.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div ref={container} className="chart" aria-label="Actual versus estimated AI cost chart" />
    </section>
  );
}
