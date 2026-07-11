import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  status?: React.ReactNode;
}

/** StandardCard — 12px radius, 16px padding. */
export function CommandCenterCard({ title, status, className = "", children, ...rest }: CardProps) {
  return (
    <div className={["cc-card", className].filter(Boolean).join(" ")} {...rest}>
      {(title || status) && (
        <div className="cc-card__title">
          <span>{title}</span>
          {status}
        </div>
      )}
      {children}
    </div>
  );
}

/** CompactCard — 10px radius, 12px padding. */
export function CommandCenterCompactCard({ title, status, className = "", children, ...rest }: CardProps) {
  return (
    <div className={["cc-card", "cc-card--compact", className].filter(Boolean).join(" ")} {...rest}>
      {(title || status) && (
        <div className="cc-card__title">
          <span>{title}</span>
          {status}
        </div>
      )}
      {children}
    </div>
  );
}

/** HeroSurface — reserved for the future primary P&L / chart area. */
export function CommandCenterHeroSurface({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["cc-surface-hero", className].filter(Boolean).join(" ")} {...rest}>{children}</div>;
}

export function CommandCenterCardRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cc-card__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
