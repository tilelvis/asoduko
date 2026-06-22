"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

/**
 * A holographic-styled modal dialog. Renders into the normal React tree
 * (no portal) and locks body scroll while open. Closes on Escape and on
 * backdrop click.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  accent = "var(--accent)",
  children,
  maxWidth = "max-w-md",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[rgba(5,8,19,0.85)] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`relative z-10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-t-xl border bg-[var(--background-elevated)] p-5 shadow-2xl sm:rounded-xl`}
        style={{
          borderColor: `${accent}55`,
          boxShadow: `0 0 24px ${accent}33, 0 8px 40px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <h2
              id="modal-title"
              className="font-mono text-base font-semibold uppercase tracking-[0.18em]"
              style={{ color: accent, textShadow: `0 0 10px ${accent}55` }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--foreground-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--grid-line)] hover:text-[var(--foreground)]"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
