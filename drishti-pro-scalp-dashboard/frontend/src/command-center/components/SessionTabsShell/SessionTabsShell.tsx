import React from "react";
import { Session } from "../../types/session";
import { SessionTab } from "./SessionTab";
import { CommandCenterTooltip } from "../ui";

interface SessionTabsShellProps {
  sessions: Session[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onAddSession: () => void;
}

export function SessionTabsShell({
  sessions, activeSessionId, onSelectSession, onCloseSession, onAddSession,
}: SessionTabsShellProps) {
  return (
    <div className="cc-session-tabs" role="tablist" aria-label="Trading sessions">
      {sessions.map((session) => (
        <SessionTab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={onSelectSession}
          onClose={session.closable ? onCloseSession : undefined}
        />
      ))}
      <CommandCenterTooltip label="New Session">
        <button type="button" className="cc-session-tab-add" aria-label="New session" onClick={onAddSession}>+</button>
      </CommandCenterTooltip>
    </div>
  );
}
