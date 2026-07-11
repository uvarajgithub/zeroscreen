import React from "react";

interface ValueDeltaProps {
  value: number | null;
  format?: (n: number) => string;
}

export function ValueDelta({ value, format }: ValueDeltaProps) {
  if (value === null) return <span className="cc-value-delta cc-value-delta--neutral">—</span>;
  const state = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "";
  const text = format ? format(value) : value.toString();
  return <span className={`cc-value-delta cc-value-delta--${state}`}>{arrow} {text}</span>;
}
