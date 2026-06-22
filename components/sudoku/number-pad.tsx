"use client";

import { memo } from "react";

interface NumberPadProps {
  /** Whether each digit 1-9 is fully "used up" on the board (all 9 placed). */
  counts: number[]; // length 10, index 1..9 hold how many of that digit remain
  notesMode: boolean;
  onDigit: (n: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

/**
 * Number pad + action buttons styled as a holographic control panel.
 * Each digit is a "key" with a soft neon border that brightens on press.
 * Action buttons (Undo / Erase / Notes) sit on a separate row beneath.
 */
function NumberPadInner({
  counts,
  notesMode,
  onDigit,
  onErase,
  onToggleNotes,
  onUndo,
  canUndo,
}: NumberPadProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Digits 1-9 */}
      <div className="grid grid-cols-9 gap-1.5 sm:gap-2">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
          const remaining = counts[n] ?? 0;
          const disabled = remaining <= 0 && !notesMode;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onDigit(n)}
              disabled={disabled}
              className={[
                "relative flex aspect-square items-center justify-center rounded-md border font-mono text-base transition-all sm:text-lg",
                disabled
                  ? "cursor-not-allowed border-[var(--grid-line)] bg-[var(--background-cell)] text-[var(--foreground-dim)]"
                  : notesMode
                    ? "border-[rgba(251,191,36,0.5)] bg-[rgba(251,191,36,0.08)] text-[#fbbf24] hover:bg-[rgba(251,191,36,0.16)]"
                    : "border-[var(--accent-soft)] bg-[var(--accent-faint)] text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-white",
              ].join(" ")}
              style={
                !disabled
                  ? {
                      boxShadow: `0 0 8px var(--accent-faint)`,
                    }
                  : undefined
              }
              aria-label={`Place ${n}`}
            >
              {n}
              {!notesMode && remaining > 0 && (
                <span className="absolute bottom-0.5 right-1 font-mono text-[8px] font-normal text-[var(--foreground-dim)]">
                  {remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          onClick={onUndo}
          disabled={!canUndo}
          label="Undo"
          icon={
            <path d="M3 7v6h6 M21 17a9 9 0 0 0-15-6.7L3 13" />
          }
        />

        <ActionButton
          onClick={onErase}
          label="Erase"
          icon={
            <>
              <path d="M20 20H7L3 16a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l4.6 4.6a2 2 0 0 1 0 2.8L13 19" />
              <path d="m22 21-12 0" />
            </>
          }
        />

        <ActionButton
          onClick={onToggleNotes}
          active={notesMode}
          label="Notes"
          activeColor="rgba(251,191,36,0.5)"
          activeBg="rgba(251,191,36,0.08)"
          activeText="#fbbf24"
          icon={
            <>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </>
          }
        />
      </div>
    </div>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  activeColor?: string;
  activeBg?: string;
  activeText?: string;
}

function ActionButton({
  onClick,
  label,
  icon,
  disabled,
  active,
  activeColor = "var(--accent-soft)",
  activeBg = "var(--accent-faint)",
  activeText = "var(--accent)",
}: ActionButtonProps) {
  const borderColor = active
    ? activeColor
    : disabled
      ? "var(--grid-line)"
      : "var(--grid-line)";
  const bgColor = active
    ? activeBg
    : "var(--background-elevated)";
  const textColor = active
    ? activeText
    : disabled
      ? "var(--foreground-dim)"
      : "var(--foreground-muted)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-medium uppercase tracking-wider transition-all"
      style={{
        borderColor,
        background: bgColor,
        color: textColor,
        boxShadow: active ? `0 0 10px ${activeColor}` : undefined,
      }}
      aria-pressed={active}
      aria-label={label}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {label}
    </button>
  );
}

export const NumberPad = memo(NumberPadInner);
