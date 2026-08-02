import Link from "next/link";
import type { ComponentProps } from "react";

/*
 * Buttons. Navy is the app's action color (CLAUDE.md: navy chrome and primary
 * buttons); the accent is never a button color. These are the canonical class
 * strings already used verbatim across the app's screens — codified here so
 * restyled pages compose them instead of retyping them.
 */
const BUTTON_VARIANT = {
  /** The one main action on a screen. */
  primary:
    "rounded-full bg-navy font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-50",
  /** Secondary action that should still read as navy. */
  outline:
    "rounded-full border border-navy font-medium text-navy transition-colors hover:bg-navy hover:text-white disabled:opacity-40",
  /** Tertiary/neutral action (cancel, print). */
  subtle:
    "rounded-full border border-line font-medium text-muted transition-colors hover:bg-chip disabled:opacity-50",
  /** Destructive action (delete). Red is functional, never decorative. */
  danger:
    "rounded-full border border-red-300 font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50",
  /**
   * Accent-chip action for a step that needs attention (finish signatures,
   * record a waiver). The one interactive use of the accent.
   */
  attention:
    "rounded-full border border-accent-border bg-accent-soft font-semibold text-ink transition-colors hover:bg-accent disabled:opacity-50",
  /**
   * Canvas-zone buttons — for actions that sit on the navy gradient itself
   * (the check-in confirmation screen), where navy-on-white reads wrong.
   */
  light:
    "rounded-full bg-white font-semibold text-navy transition-colors hover:bg-white/90 disabled:opacity-50",
  ghost:
    "rounded-full border border-white/30 bg-white/5 font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50",
} as const;

const BUTTON_SIZE = {
  /** The big screen-level action (save a form, finalize a flow). Base text. */
  lg: "px-4 py-2.5",
  md: "px-4 py-2 text-sm",
  /** Compact — inline row actions and chip-sized controls. */
  sm: "px-3.5 py-1.5 text-xs",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

function cx(variant: ButtonVariant, size: ButtonSize, className?: string) {
  const base = `${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]}`;
  return className ? `${base} ${className}` : base;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ComponentProps<"button">) {
  return <button type={type} className={cx(variant, size, className)} {...props} />;
}

/** Link styled as a button — for actions that are really navigations. */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & ComponentProps<typeof Link>) {
  return <Link className={cx(variant, size, className)} {...props} />;
}
