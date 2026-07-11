import React from "react";
import { CommandCenterButton } from "./CommandCenterButton";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** CC-007 confirmation surface — reuses CC-004's card/button tokens only, no new design system. */
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="cc-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="cc-modal cc-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cc-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cc-confirm-title" className="cc-card__title">{title}</h2>
        <div className="cc-modal__body">{message}</div>
        <div className="cc-modal__actions">
          <CommandCenterButton variant="neutral" onClick={onCancel}>{cancelLabel}</CommandCenterButton>
          <CommandCenterButton variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</CommandCenterButton>
        </div>
      </div>
    </div>
  );
}
