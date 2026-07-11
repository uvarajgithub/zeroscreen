import React, { useEffect, useMemo, useState } from "react";
import "./theme/command-center.tokens.css";
import "./theme/command-center.components.css";
import { CommandCenterHeader } from "./components/CommandCenterHeader/CommandCenterHeader";
import { CommandBarShell } from "./components/CommandBarShell/CommandBarShell";
import { SessionTabsShell } from "./components/SessionTabsShell/SessionTabsShell";
import { TradingDashboard } from "./components/TradingDashboard/TradingDashboard";
import { BottomWorkspaceTabsShell } from "./components/BottomWorkspaceTabsShell/BottomWorkspaceTabsShell";
import { SessionConfigPanel } from "./components/SessionConfigPanel/SessionConfigPanel";
import { ConfirmDialog } from "./components/ui";
import { BottomWorkspaceTab } from "./types/session";
import { SessionManager, ConfirmableAction } from "./business/SessionManager";
import { NewSessionConfig } from "./business/SessionValidation";

interface PendingConfirmation {
  action: ConfirmableAction;
  sessionId: string;
  title: string;
  message: string;
  danger?: boolean;
  run: () => void;
}

/**
 * No visual redesign here (CC-004's tokens/components are reused as-is) —
 * this file wires the Command Bar, session tabs, and "+ New Session"
 * workflow to the CC-006 SessionManager, with confirmations per CC-007 §18.
 */
export function CommandCenterPage() {
  const manager = useMemo(() => new SessionManager(), []);
  const [sessions, setSessions] = useState(() => manager.listSessions());
  const [activeSessionId, setActiveSessionId] = useState(() => manager.getActiveSessionId());
  const [activeBottomTab, setActiveBottomTab] = useState<BottomWorkspaceTab>("Trades");
  const [isConfigPanelOpen, setConfigPanelOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [, forceTick] = useState(0);

  useEffect(() => manager.onActiveSessionChange(setActiveSessionId), [manager]);

  // The one timer this whole real-time layer needs; cleaned up on unmount.
  // Only the active session's dashboard needs frequent visual updates, but
  // every subscribed session still ticks so background sessions keep updating.
  useEffect(() => {
    const id = setInterval(() => { manager.tick().then(() => forceTick((n) => n + 1)); }, 3000);
    return () => clearInterval(id);
  }, [manager]);

  function refresh() {
    setSessions(manager.listSessions());
    setActiveSessionId(manager.getActiveSessionId());
  }

  function runWithConfirmation(action: ConfirmableAction, sessionId: string, copy: { title: string; message: string; danger?: boolean }, run: () => void) {
    if (manager.needsConfirmation(sessionId, action)) {
      setPendingConfirmation({ action, sessionId, run, ...copy });
      return;
    }
    run();
  }

  function guarded(fn: () => void) {
    try {
      setErrorMessage(null);
      fn();
      refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  // ── "+ New Session" ─────────────────────────────────────────────────
  function handleAddSession() { setConfigPanelOpen(true); }

  function handleCreateSession(config: NewSessionConfig, start: boolean) {
    guarded(() => manager.createSession(config, { start }));
    setConfigPanelOpen(false);
  }

  // ── Session tabs ────────────────────────────────────────────────────
  function handleSelectSession(id: string) {
    manager.setActiveSession(id); // no confirmation: switching tabs never stops/resets another session
    setActiveSessionId(id);
  }

  function handleCloseSession(id: string) {
    const session = manager.getSession(id);
    if (!session?.closable) return;
    runWithConfirmation(
      "close", id,
      { title: `Close ${session.name}?`, message: "This removes the tab only — trades, history and analytics for this session are kept and remain accessible." },
      () => guarded(() => manager.closeSession(id)),
    );
  }

  // ── Command Bar actions — always target the active session ────────
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  function handleStart() {
    runWithConfirmation(
      "start", activeSession.id,
      { title: `Start ${activeSession.name}?`, message: "This will begin monitoring the market and may place real orders for a LIVE session." },
      () => guarded(() => manager.startSession(activeSession.id)),
    );
  }
  function handlePause() {
    runWithConfirmation("pause", activeSession.id, { title: `Pause ${activeSession.name}?`, message: "New entries stop; existing state is preserved." }, () => guarded(() => manager.pauseSession(activeSession.id)));
  }
  function handleResume() {
    runWithConfirmation("resume", activeSession.id, { title: `Resume ${activeSession.name}?`, message: "Continues from the preserved session state." }, () => guarded(() => manager.resumeSession(activeSession.id)));
  }
  function handleStop() {
    runWithConfirmation(
      "stop", activeSession.id,
      { title: `Stop ${activeSession.name}?`, message: "The runtime will stop after handling any active position or pending order per existing engine behaviour." },
      () => guarded(() => manager.stopSession(activeSession.id)),
    );
  }
  function handleEmergencyStop() {
    runWithConfirmation(
      "emergencyStop", activeSession.id,
      { title: `Emergency Stop ${activeSession.name}?`, message: "This blocks new entries, cancels pending orders, closes any active position, and stops the runtime immediately. This cannot be undone.", danger: true },
      () => guarded(() => {
        const result = manager.emergencyStop(activeSession.id);
        if (!result.success) {
          throw new Error(`Emergency stop partially failed: ${result.steps.filter(s => !s.success).map(s => s.name).join(", ")}`);
        }
      }),
    );
  }

  return (
    <div className="cc-app">
      <CommandCenterHeader status={activeSession.status} />
      {errorMessage && <div className="cc-alert cc-alert--danger" role="alert">{errorMessage}</div>}
      <CommandBarShell
        session={activeSession}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onEmergencyStop={handleEmergencyStop}
      />
      <div className="cc-session-tabs-wrap">
        <SessionTabsShell
          sessions={sessions}
          activeSessionId={activeSession.id}
          onSelectSession={handleSelectSession}
          onCloseSession={handleCloseSession}
          onAddSession={handleAddSession}
        />
        {isConfigPanelOpen && (
          <SessionConfigPanel onCreate={handleCreateSession} onCancel={() => setConfigPanelOpen(false)} />
        )}
      </div>
      <TradingDashboard
        session={activeSession}
        dashboard={manager.getDashboard(activeSession.id)}
        health={manager.getHealth(activeSession.id)}
      />
      <BottomWorkspaceTabsShell session={activeSession} activeTab={activeBottomTab} onSelectTab={setActiveBottomTab} />

      {pendingConfirmation && (
        <ConfirmDialog
          title={pendingConfirmation.title}
          message={pendingConfirmation.message}
          danger={pendingConfirmation.danger}
          confirmLabel="Confirm"
          onConfirm={() => { pendingConfirmation.run(); setPendingConfirmation(null); }}
          onCancel={() => setPendingConfirmation(null)}
        />
      )}
    </div>
  );
}
