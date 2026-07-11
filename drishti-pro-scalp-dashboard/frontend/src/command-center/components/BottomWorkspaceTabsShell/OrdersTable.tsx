import React from "react";
import { Session } from "../../types/session";
import { CommandCenterTable } from "../ui";

const COLUMNS = [
  { key: "time", label: "Time" },
  { key: "order", label: "Order" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "avgPrice", label: "Average Price", numeric: true },
  { key: "remarks", label: "Remarks" },
];

export function OrdersTable(_props: { session: Session }) {
  return <CommandCenterTable columns={COLUMNS} rows={[]} emptyLabel="No orders — orders will appear after execution." />;
}
