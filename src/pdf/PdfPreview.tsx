import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Scan,
  FileText,
  LoaderCircle,
  Download,
  RefreshCw,
  AlertCircle,
  CircleHelp,
  AlertTriangle,
  Crosshair,
} from "lucide-react";
import type { PdfPosition } from "../core/api";
import { pdfSourcePosition } from "./pdfSync";
GlobalWorkerOptions.workerSrc = workerUrl;
type Props = {
  document: string;
  documents: string[];
  onDocumentChange: (path: string) => void;
  onDocumentHelp: () => void;
  bytes: Uint8Array | null;
  compiling: boolean;
  onCompile: () => void;
  onFix: () => void;
  fixing: boolean;
  onExport: () => void;
  onError: (message: string) => void;
  onPages: (count: number) => void;
  status: "ready" | "success" | "error" | "stale";
  onProblems: () => void;
  sourceMapAvailable: boolean;
  onSourceLocation?: (position: PdfPosition) => Promise<void>;
};
export function PdfPreview({
  document: mainDocument,
  documents,
  onDocumentChange,
  onDocumentHelp,
  bytes,
  compiling,
  onCompile,
  onFix,
  fixing,
  onExport,
  onError,
  onPages,
  status,
  onProblems,
  sourceMapAvailable,
  onSourceLocation,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    textLayer = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null);
  const activePdf = useRef<PDFDocumentProxy | null>(null);
  const renderedPage = useRef<{
    pdf: PDFDocumentProxy;
    page: number;
    viewport: Parameters<typeof pdfSourcePosition>[3];
    view: number[];
    userUnit: number;
  } | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const sourceBusy = useRef(false);
  const [sourceMode, setSourceMode] = useState(true);
  const [locatingSource, setLocatingSource] = useState(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState<number | null>(null),
    [fit, setFit] = useState("width"),
    [height, setHeight] = useState(700),
    [pageInput, setPageInput] = useState("1"),
    [width, setWidth] = useState(500),
    [rendering, setRendering] = useState(false);
  const callbacks = useRef({ onError, onPages });
  callbacks.current = { onError, onPages };
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
      setHeight(entries[0].contentRect.height);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPageInput(String(page));
    container.current?.scrollTo({ top: 0, left: 0 });
  }, [page]);
  useEffect(() => {
    renderedPage.current = null;
    activePdf.current = null;
    if (!bytes) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    const task = getDocument({
      data: bytes.slice(),
      cMapUrl: new URL("/pdfjs/cmaps/", location.href).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("/pdfjs/standard_fonts/", location.href)
        .href,
      wasmUrl: new URL("/pdfjs/wasm/", location.href).href,
    });
    task.promise
      .then((doc) => {
        if (cancelled) return;
        activePdf.current = doc;
        setPdf(doc);
        setPage((p) => Math.min(p, doc.numPages));
        callbacks.current.onPages(doc.numPages);
      })
      .catch((e) => {
        if (!cancelled)
          callbacks.current.onError(
            `PDF konnte nicht geladen werden: ${String(e)}`,
          );
      });
    return () => {
      cancelled = true;
      activePdf.current = null;
      void task.destroy();
    };
  }, [bytes]);
  useEffect(() => {
    if (!pdf || !canvas.current || activePdf.current !== pdf) return;
    let cancelled = false;
    let layer: TextLayer | undefined;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    renderedPage.current = null;
    setRendering(true);
    void Promise.resolve()
      .then(() => {
        if (cancelled || activePdf.current !== pdf) return;
        return pdf.getPage(page);
      })
      .then(async (p) => {
        if (!p || cancelled || !canvas.current || activePdf.current !== pdf)
          return;
        const natural = p.getViewport({ scale: 1 });
        const fitted = (width - 48) / natural.width;
        const scale =
          zoom ??
          Math.max(
            0.2,
            fit === "page"
              ? Math.min(fitted, (height - 48) / natural.height)
              : fitted,
          );
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(
            16_000_000 / (natural.width * natural.height * scale * scale),
          ),
        );
        const viewport = p.getViewport({ scale: scale * ratio });
        // Render into a private buffer: rapid zoom/resize changes must never
        // clear the visible PDF or let two render tasks share one canvas.
        const buffer = document.createElement("canvas");
        buffer.width = viewport.width;
        buffer.height = viewport.height;
        render = p.render({ canvas: buffer, viewport });
        await render.promise;
        if (cancelled || !canvas.current || activePdf.current !== pdf) return;
        const target = canvas.current;
        target.width = buffer.width;
        target.height = buffer.height;
        target.style.width = `${viewport.width / ratio}px`;
        target.style.height = `${viewport.height / ratio}px`;
        target.getContext("2d")!.drawImage(buffer, 0, 0);
        buffer.width = buffer.height = 0;
        if (!cancelled && textLayer.current && activePdf.current === pdf) {
          const targetLayer = textLayer.current;
          targetLayer.replaceChildren();
          targetLayer.style.setProperty("--total-scale-factor", String(scale));
          const source = await p.getTextContent();
          if (cancelled || activePdf.current !== pdf) return;
          layer = new TextLayer({
            textContentSource: source,
            container: targetLayer,
            viewport: p.getViewport({ scale }),
          });
          await layer.render();
        }
        if (!cancelled) {
          renderedPage.current = {
            pdf,
            page,
            viewport: p.getViewport({ scale }),
            view: p.view,
            userUnit: p.userUnit,
          };
          setRendering(false);
        }
      })
      .catch((e) => {
        if (
          !cancelled &&
          activePdf.current === pdf &&
          e?.name !== "RenderingCancelledException"
        ) {
          setRendering(false);
          callbacks.current.onError(String(e));
        }
      });
    return () => {
      cancelled = true;
      render?.cancel();
      layer?.cancel();
      renderedPage.current = null;
    };
  }, [pdf, page, width, height, zoom, fit]);
  const changeZoom = useCallback(
    (delta: number) =>
      setZoom((z) =>
        Math.max(0.25, Math.min(3, (z ?? (width - 64) / 595) + delta)),
      ),
    [width],
  );
  const sourceReady =
    !!onSourceLocation &&
    sourceMapAvailable &&
    status === "success" &&
    !compiling;
  const sourceTitle = !onSourceLocation
    ? "Zur LaTeX-Stelle springen ist in der Desktop-App verfügbar."
    : !sourceMapAvailable
      ? "Kompiliere mit pdfLaTeX, XeLaTeX oder LuaLaTeX, um PDF-Stellen im Quelltext zu öffnen."
      : compiling || status !== "success"
        ? "Die PDF muss zuerst mit dem aktuellen Quelltext kompiliert werden."
        : sourceMode
          ? "PDF anklicken → passende LaTeX-Zeile öffnen. Klicken deaktiviert den Modus."
          : "PDF-Klick zum Öffnen der passenden LaTeX-Zeile aktivieren.";
  const locateSource = async (clientX: number, clientY: number) => {
    const rendered = renderedPage.current;
    if (
      !sourceReady ||
      !sourceMode ||
      sourceBusy.current ||
      !rendered ||
      rendered.pdf !== pdf ||
      rendered.page !== page ||
      !canvas.current
    )
      return;
    const position = pdfSourcePosition(
      clientX,
      clientY,
      canvas.current.getBoundingClientRect(),
      rendered.viewport,
      rendered.view,
      page,
      rendered.userUnit,
    );
    if (!position) return;
    sourceBusy.current = true;
    setLocatingSource(true);
    try {
      await onSourceLocation!(position);
    } catch (error) {
      onError(String(error).replace(/^Error: /, ""));
    } finally {
      sourceBusy.current = false;
      setLocatingSource(false);
    }
  };
  const clickSource = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return;
    const start = pointerStart.current;
    pointerStart.current = null;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    )
      return;
    const selection = window.getSelection();
    if (
      selection &&
      !selection.isCollapsed &&
      event.currentTarget.contains(selection.anchorNode)
    )
      return;
    void locateSource(event.clientX, event.clientY);
  };
  return (
    <div className="preview-pane">
      <div className="pane-heading">
        <div className="pane-title">PDF</div>
        <div className="preview-source">
          <label>
            <span className="preview-source-label">Vorschau aus</span>
            <select
              aria-label="Vorschaudokument"
              title={mainDocument || "Hauptdokument auswählen"}
              value={mainDocument}
              onChange={(event) => onDocumentChange(event.target.value)}
              disabled={compiling}
            >
              <option value="" disabled>
                Dokument auswählen …
              </option>
              {documents.map((path) => (
                <option value={path} key={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="inline-actions">
          <button
            className={`pdf-source-toggle ${sourceMode && sourceReady ? "active" : ""}`}
            title={sourceTitle}
            aria-label="PDF-Klick öffnet LaTeX-Stelle"
            aria-pressed={sourceMode}
            disabled={!sourceReady}
            onClick={() => setSourceMode((mode) => !mode)}
          >
            <Crosshair size={14} />
            <span>LaTeX finden</span>
          </button>
          <button
            className="icon-button preview-help"
            title="Hilfe zu Hauptdokument und Kapiteldateien"
            onClick={onDocumentHelp}
          >
            <CircleHelp size={14} />
          </button>
          <button
            className="icon-button"
            title="Vorschau aktualisieren (Strg+Enter)"
            onClick={onCompile}
            disabled={compiling}
          >
            {compiling ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
          <button
            className="icon-button"
            title="PDF exportieren"
            onClick={onExport}
            disabled={!pdf}
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      {pdf && sourceMapAvailable && sourceMode && sourceReady && (
        <div className="pdf-source-hint" role="status">
          {locatingSource ? (
            <LoaderCircle size={12} className="spin" />
          ) : (
            <Crosshair size={12} />
          )}
          {locatingSource
            ? "Passende LaTeX-Stelle wird geöffnet …"
            : "PDF anklicken → LaTeX-Stelle öffnen"}
        </div>
      )}
      {pdf && !compiling && (status === "error" || status === "stale") && (
        <button
          className={`preview-status ${status}`}
          onClick={status === "error" ? onProblems : onCompile}
        >
          <AlertTriangle size={13} />
          <span>
            {status === "error"
              ? "Letzte erfolgreiche PDF · Compilerfehler prüfen"
              : "Änderungen noch nicht in der PDF · Aktualisieren"}
          </span>
        </button>
      )}
      <div className="preview-scroll" ref={container}>
        {pdf ? (
          <div
            className={`paper-wrap ${sourceReady && sourceMode ? "pdf-source-active" : ""}`}
            tabIndex={sourceReady && sourceMode ? 0 : undefined}
            aria-label={
              sourceReady && sourceMode
                ? "PDF-Seite: Klicken öffnet die LaTeX-Stelle. Eingabetaste öffnet den Quelltext zur Seitenmitte."
                : undefined
            }
            onPointerDown={(event) => {
              pointerStart.current = { x: event.clientX, y: event.clientY };
            }}
            onClick={clickSource}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.target !== event.currentTarget ||
                !canvas.current
              )
                return;
              event.preventDefault();
              const bounds = canvas.current.getBoundingClientRect();
              void locateSource(
                bounds.left + bounds.width / 2,
                bounds.top + bounds.height / 2,
              );
            }}
          >
            <canvas
              ref={canvas}
              aria-label={`PDF-Vorschau, Seite ${page} von ${pdf.numPages}`}
            />
            <div
              ref={textLayer}
              className="textLayer"
              aria-label={`PDF-Text, Seite ${page}`}
            />
            <div className="paper-shadow" />
            {rendering && (
              <span className="render-indicator">
                <LoaderCircle className="spin" size={12} />
              </span>
            )}
          </div>
        ) : (
          <div className="preview-empty">
            <div className="empty-document">
              <FileText size={32} strokeWidth={1} />
            </div>
            <h3>
              {status === "error"
                ? "PDF konnte nicht erstellt werden"
                : "Noch keine PDF"}
            </h3>
            <p>
              {status === "error" ? (
                <>
                  Prüfe die Compiler-Meldungen für{" "}
                  <strong>{mainDocument || "dein Dokument"}</strong>.
                </>
              ) : (
                <>
                  Kompiliere <strong>{mainDocument || "dein Dokument"}</strong>,
                  um die Vorschau anzuzeigen.
                </>
              )}
            </p>
            <button
              className="button secondary"
              onClick={status === "error" ? onProblems : onCompile}
              disabled={compiling}
            >
              {compiling ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <RefreshCw size={15} />
              )}{" "}
              {compiling
                ? "Wird kompiliert …"
                : status === "error"
                  ? "Probleme anzeigen"
                  : "Vorschau erstellen"}
            </button>
            {status === "error" && (
              <button
                className="button primary"
                onClick={onFix}
                disabled={compiling || fixing}
              >
                Compilerfehler beheben
              </button>
            )}
            <span className="keyboard-hint">
              {status === "error" ? "Strg + J" : "Strg + Enter"}
            </span>
          </div>
        )}
        {compiling && pdf && (
          <div className="compiling-badge">
            <LoaderCircle size={13} className="spin" /> Vorschau wird
            aktualisiert
          </div>
        )}
      </div>
      <div className="preview-controls">
        <div className="inline-actions">
          <button
            className="icon-button"
            title="Vorherige Seite"
            disabled={!pdf || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <label className="page-counter">
            <input
              aria-label="PDF-Seite"
              inputMode="numeric"
              value={pdf ? pageInput : "—"}
              disabled={!pdf}
              onChange={(e) => setPageInput(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => {
                const next = Number(pageInput);
                if (
                  Number.isInteger(next) &&
                  pdf &&
                  next >= 1 &&
                  next <= pdf.numPages
                )
                  setPage(next);
                else setPageInput(String(page));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setPageInput(String(page));
                  e.currentTarget.blur();
                }
              }}
            />
            <span>/ {pdf?.numPages ?? "—"}</span>
          </label>
          <button
            className="icon-button"
            title="Nächste Seite"
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="inline-actions">
          <button
            className="icon-button"
            title="Verkleinern"
            disabled={!pdf}
            onClick={() => changeZoom(-0.1)}
          >
            <Minus size={14} />
          </button>
          <select
            className="pdf-zoom"
            aria-label="PDF-Zoom"
            disabled={!pdf}
            value={zoom ? String(Math.round(zoom * 100)) : fit}
            onChange={(e) => {
              if (["page", "width"].includes(e.target.value)) {
                setZoom(null);
                setFit(e.target.value);
              } else setZoom(Number(e.target.value) / 100);
            }}
          >
            <option value="width">Seitenbreite</option>
            <option value="page">Ganze Seite</option>
            {[
              ...new Set([
                50,
                75,
                100,
                125,
                150,
                200,
                ...(zoom ? [Math.round(zoom * 100)] : []),
              ]),
            ]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} %
                </option>
              ))}
          </select>
          <button
            className="icon-button"
            title="Vergrößern"
            disabled={!pdf}
            onClick={() => changeZoom(0.1)}
          >
            <Plus size={14} />
          </button>
          <span className="control-divider" />
          <button
            className="icon-button"
            title="An Breite anpassen"
            onClick={() => {
              setZoom(null);
              setFit("width");
            }}
          >
            <Scan size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice">
      <AlertCircle size={16} />
      {message}
    </div>
  );
}
