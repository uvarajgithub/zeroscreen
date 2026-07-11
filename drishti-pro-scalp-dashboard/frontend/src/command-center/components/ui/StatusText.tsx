import React from "react";
import { StatusDot } from "./StatusDot";

interface StatusTextProps {
  color: string;
  text: string;
  pulse?: boolean;
}

export function StatusText({ color, text, pulse }: StatusTextProps) {
  return (
    <span className="cc-status-text">
      <StatusDot color={color} pulse={pulse} />
      {text}
    </span>
  );
}
