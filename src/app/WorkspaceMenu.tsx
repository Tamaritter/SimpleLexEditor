import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type WorkspaceAction = {
  label: string;
  icon: LucideIcon;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  separator?: boolean;
  run: () => void;
};

export function WorkspaceMenu({
  label,
  children,
  actions,
  className = "",
}: {
  label: string;
  children: ReactNode;
  actions: WorkspaceAction[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const initialFocus = useRef<"first" | "last">("first");
  useEffect(() => {
    if (!open) return;
    const buttons =
      panel.current?.querySelectorAll<HTMLButtonElement>("button:enabled");
    (initialFocus.current === "last"
      ? buttons?.[buttons.length - 1]
      : buttons?.[0]
    )?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      ref={root}
      className={`workspace-menu ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) {
            initialFocus.current = ["ArrowUp", "End"].includes(event.key)
              ? "last"
              : "first";
            setOpen(true);
            return;
          }
          const buttons = Array.from(
            panel.current?.querySelectorAll<HTMLButtonElement>(
              "button:enabled",
            ) || [],
          );
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current +
                    (event.key === "ArrowUp" ? -1 : 1) +
                    buttons.length) %
                  buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="workspace-menu-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          initialFocus.current = "first";
          setOpen((value) => !value);
        }}
      >
        {children}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="workspace-menu-panel"
          role="group"
          aria-label={label}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              aria-label={action.label}
              className={action.separator ? "menu-section" : ""}
              disabled={action.disabled}
              aria-pressed={action.selected}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                action.run();
              }}
            >
              <action.icon size={15} />
              <span>{action.label}</span>
              {action.hint && <kbd>{action.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
