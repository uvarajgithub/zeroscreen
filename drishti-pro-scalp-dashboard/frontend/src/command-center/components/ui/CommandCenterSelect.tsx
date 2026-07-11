import React from "react";

interface CommandCenterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: string[];
  error?: boolean;
}

/** One shared select visual for every Command Bar selector (Strategy/Instrument/Product/Mode/Broker). */
export function CommandCenterSelect({ label, options, error, className = "", id, ...rest }: CommandCenterSelectProps) {
  const selectId = id ?? `cc-select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="cc-field">
      <label className="cc-field__label" htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        className={["cc-select", error ? "cc-select--error" : "", className].filter(Boolean).join(" ")}
        {...rest}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
