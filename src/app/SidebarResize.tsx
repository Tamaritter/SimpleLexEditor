import { useEffect, useState, type RefObject } from "react";

export function SidebarResize({
  sidebar,
  onResize,
  onReset,
}: {
  sidebar: RefObject<HTMLElement | null>;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const [width, setWidth] = useState(225);
  const [maximum, setMaximum] = useState(420);
  const constrain = (value: number) =>
    Math.round(Math.max(180, Math.min(420, window.innerWidth * 0.35, value)));
  useEffect(() => {
    const node = sidebar.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setWidth(Math.round(node.getBoundingClientRect().width));
      setMaximum(Math.floor(Math.min(420, window.innerWidth * 0.35)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [sidebar]);
  return (
    <div
      className="sidebar-resize"
      role="separator"
      aria-label="Breite der Seitenleiste ändern"
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={maximum}
      aria-valuenow={width}
      tabIndex={0}
      title="Seitenleiste ziehen · Doppelklick setzt die Breite zurück"
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        onResize(
          constrain(
            event.key === "Home"
              ? 180
              : event.key === "End"
                ? maximum
                : width + (event.key === "ArrowRight" ? 16 : -16),
          ),
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const node = event.currentTarget;
        const originX = event.clientX;
        const originWidth =
          sidebar.current?.getBoundingClientRect().width || width;
        node.setPointerCapture(event.pointerId);
        const move = (next: PointerEvent) => {
          onResize(constrain(originWidth + next.clientX - originX));
        };
        const release = () => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("lostpointercapture", release);
        };
        node.addEventListener("pointermove", move);
        node.addEventListener("lostpointercapture", release);
      }}
    />
  );
}
