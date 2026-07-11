import React from "react";
import { StatusText } from "./StatusText";

export type Connection = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";

const COLOR: Record<Connection, string> = {
  CONNECTED: "var(--cc-success)",
  DISCONNECTED: "var(--cc-danger)",
  UNKNOWN: "var(--cc-text-muted)",
};

const LABEL: Record<Connection, string> = {
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  UNKNOWN: "Unknown",
};

export function ConnectionState({ state }: { state: Connection }) {
  return <StatusText color={COLOR[state]} text={LABEL[state]} pulse={state === "CONNECTED"} />;
}
