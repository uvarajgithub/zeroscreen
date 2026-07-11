import React from "react";
import { CommandCenterSelect, CommandCenterButton } from "../ui";
import { Session, SessionLifecycleState } from "../../types/session";

interface CommandBarShellProps {
  session: Session;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onEmergencyStop: () => void;
}

const RUNNING_LIKE: SessionLifecycleState[] = ["RUNNING", "PAUSED", "STOPPING"];

/**
 * Reflects the ACTIVE session's own configuration (read-only — strategy,
 * instrument, product, mode and broker can never be changed from the
 * Command Center, per CC-007 §1/§3) and drives Start/Pause-or-Resume/Stop/
 * Emergency Stop against that session's runtime via SessionManager.
 */
export function CommandBarShell({ session, onStart, onPause, onResume, onStop, onEmergencyStop }: CommandBarShellProps) {
  const canStart = session.status === "READY" || session.status === "STOPPED";
  const isStarting = session.status === "STARTING";
  const isRunning = session.status === "RUNNING";
  const isPaused = session.status === "PAUSED";
  const canStop = RUNNING_LIKE.includes(session.status);
  const canEmergencyStop = isRunning || isPaused;

  return (
    <section className="cc-command-bar" aria-label="Command bar">
      <CommandCenterSelect label="Strategy" options={[session.strategy]} disabled value={session.strategy} />
      <CommandCenterSelect label="Instrument" options={[session.instrument]} disabled value={session.instrument} />
      <CommandCenterSelect label="Product" options={[session.product]} disabled value={session.product} />
      <CommandCenterSelect label="Mode" options={[session.mode]} disabled value={session.mode} />
      <CommandCenterSelect label="Broker" options={[session.broker ?? "—"]} disabled value={session.broker ?? "—"} />

      <div className="cc-command-bar__spacer" />

      <div className="cc-command-bar__actions">
        <CommandCenterButton variant="primary" disabled={!canStart} loading={isStarting} onClick={onStart}>Start</CommandCenterButton>
        {isPaused ? (
          <CommandCenterButton variant="secondary" onClick={onResume}>Resume</CommandCenterButton>
        ) : (
          <CommandCenterButton variant="secondary" disabled={!isRunning} onClick={onPause}>Pause</CommandCenterButton>
        )}
        <CommandCenterButton variant="neutral" disabled={!canStop} onClick={onStop}>Stop</CommandCenterButton>
        <CommandCenterButton variant="danger" disabled={!canEmergencyStop} onClick={onEmergencyStop}>Emergency Stop</CommandCenterButton>
      </div>

      <p className="cc-command-bar__hint">Actions apply to the active session tab only.</p>
    </section>
  );
}
