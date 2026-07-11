import React from "react";

export type ButtonVariant = "primary" | "secondary" | "neutral" | "danger" | "ghost" | "icon";

interface CommandCenterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function CommandCenterButton({
  variant = "secondary", loading = false, className = "", children, disabled, ...rest
}: CommandCenterButtonProps) {
  const classes = ["cc-btn", `cc-btn--${variant}`, loading ? "cc-btn--loading" : "", className]
    .filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {children}
    </button>
  );
}
