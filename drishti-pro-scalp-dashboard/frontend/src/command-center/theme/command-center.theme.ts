/**
 * Typed mirror of command-center.tokens.css — use this in TS/TSX when a
 * value is needed in logic (e.g. picking a mode color), not for styling
 * (styling should reference the CSS variables directly via className/CSS).
 */
import { SessionMode } from "../types/session";

export const commandCenterTheme = {
  colors: {
    bg: "var(--cc-bg)",
    surface1: "var(--cc-surface-1)",
    surface2: "var(--cc-surface-2)",
    surfaceHover: "var(--cc-surface-hover)",
    border: "var(--cc-border)",
    borderStrong: "var(--cc-border-strong)",
    textPrimary: "var(--cc-text-primary)",
    textSecondary: "var(--cc-text-secondary)",
    textMuted: "var(--cc-text-muted)",
    accent: "var(--cc-accent)",
    accentHover: "var(--cc-accent-hover)",
    success: "var(--cc-success)",
    danger: "var(--cc-danger)",
    warning: "var(--cc-warning)",
    info: "var(--cc-info)",
  },
  spacing: {
    1: "var(--cc-space-1)",
    2: "var(--cc-space-2)",
    3: "var(--cc-space-3)",
    4: "var(--cc-space-4)",
    5: "var(--cc-space-5)",
    6: "var(--cc-space-6)",
    8: "var(--cc-space-8)",
  },
  radius: {
    sm: "var(--cc-radius-sm)",
    control: "var(--cc-radius-control)",
    tab: "var(--cc-radius-tab)",
    card: "var(--cc-radius-card)",
    hero: "var(--cc-radius-hero)",
  },
  shadow: {
    elevation1: "var(--cc-shadow-elevation-1)",
  },
  motion: {
    fast: "var(--cc-motion-fast)",
    standard: "var(--cc-motion-standard)",
    panel: "var(--cc-motion-panel)",
  },
  sizes: {
    controlHeight: "var(--cc-control-height)",
    buttonHeight: "var(--cc-button-height)",
    tabHeight: "var(--cc-tab-height)",
    statusDotSize: "var(--cc-status-dot-size)",
    minTarget: "var(--cc-min-target)",
  },
} as const;

/** Session-mode -> indicator color mapping. Green=LIVE, Blue=PAPER, Purple=SHADOW, Amber=BACKTEST. */
export const MODE_COLOR_VAR: Record<SessionMode, string> = {
  LIVE: "var(--cc-live-mode)",
  PAPER: "var(--cc-paper-mode)",
  SHADOW: "var(--cc-shadow-mode)",
  BACKTEST: "var(--cc-backtest-mode)",
};

export const MODE_LABEL: Record<SessionMode, string> = {
  LIVE: "Live",
  PAPER: "Paper",
  SHADOW: "Shadow",
  BACKTEST: "Backtest",
};
