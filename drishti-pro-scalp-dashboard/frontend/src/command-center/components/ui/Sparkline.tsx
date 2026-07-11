import React from "react";

interface SparklinePoint { t: string; value: number }

interface SparklineProps {
  points: SparklinePoint[];
  positiveColor?: string;
  negativeColor?: string;
}

/** Minimal inline-SVG equity curve — no charting library, no indicators, no strategy reasoning. */
export function Sparkline({ points, positiveColor = "var(--cc-success)", negativeColor = "var(--cc-danger)" }: SparklineProps) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const width = 100;
  const height = 100;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.value - min) / range) * height;
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const color = last >= 0 ? positiveColor : negativeColor;
  const summary = `Equity curve, ${points.length} points, latest value ${last.toFixed(2)}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={summary}>
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
