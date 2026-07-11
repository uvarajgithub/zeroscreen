import React from "react";
import { Session } from "../../types/session";
import { MODE_COLOR_VAR } from "../../theme/command-center.theme";
import { StatusDot } from "../ui";

interface SessionTabProps {
  session: Session;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}

export function SessionTab({ session, isActive, onSelect, onClose }: SessionTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      id={`session-tab-${session.id}`}
      aria-controls={`session-tabpanel-${session.id}`}
      className={["cc-session-tab", session.isPinned ? "cc-session-tab--pinned" : ""].filter(Boolean).join(" ")}
      onClick={() => onSelect(session.id)}
    >
      <StatusDot color={MODE_COLOR_VAR[session.mode]} pulse={session.isPinned && session.mode === "LIVE"} label={`${session.mode} mode`} />
      {session.isPinned && <span className="cc-session-tab__pin" aria-label="Pinned">📌</span>}
      <span>{session.name}</span>
      {session.closable && onClose && (
        <span
          className="cc-session-tab__close"
          role="button"
          aria-label={`Close ${session.name}`}
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClose(session.id); } }}
        >
          ×
        </span>
      )}
    </button>
  );
}
