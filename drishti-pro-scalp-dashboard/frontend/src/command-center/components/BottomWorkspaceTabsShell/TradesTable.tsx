import React from "react";
import { Session } from "../../types/session";
import { CommandCenterTable } from "../ui";

const COLUMNS = [
  { key: "time", label: "Time" },
  { key: "symbol", label: "Symbol" },
  { key: "direction", label: "Direction" },
  { key: "qty", label: "Qty", numeric: true },
  { key: "entry", label: "Entry", numeric: true },
  { key: "exit", label: "Exit", numeric: true },
  { key: "pnl", label: "P&L", numeric: true },
  { key: "status", label: "Status" },
  { key: "actions", label: "Actions" },
];

export function TradesTable(_props: { session: Session }) {
  return <CommandCenterTable columns={COLUMNS} rows={[]} emptyLabel="No trades — trades will appear after execution." />;
}
