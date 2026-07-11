import React from "react";

interface CommandCenterEmptyStateProps {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export function CommandCenterEmptyState({ icon = "○", title, body, action }: CommandCenterEmptyStateProps) {
  return (
    <div className="cc-empty-state">
      <span className="cc-empty-state__icon" aria-hidden="true">{icon}</span>
      <p className="cc-empty-state__title">{title}</p>
      {body && <p className="cc-empty-state__body">{body}</p>}
      {action}
    </div>
  );
}
