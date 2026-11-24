import { Component, type ErrorInfo, type ReactNode } from "react";
import { localStore } from "../core/safety";
import { api } from "../core/api";
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    localStore.setItem(
      "roxena-last-error",
      JSON.stringify({
        message: error.message,
        stack: info.componentStack,
        date: new Date().toISOString(),
      }),
    );
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-recovery">
        <img className="brand-symbol" src="/favicon.svg" alt="" />
        <h1>SimpleLexEditor konnte die Ansicht nicht fortsetzen.</h1>
        <p>
          Deine Projektdateien bleiben erhalten. Ungespeicherte Texte werden
          beim erneuten Öffnen aus den verfügbaren Entwürfen wiederhergestellt.
        </p>
        <div>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Arbeitsbereich erneut öffnen
          </button>
          <button
            className="button secondary"
            onClick={() => {
              const drafts: Record<string, string> = {};
              try {
                for (let i = 0; i < window.localStorage.length; i++) {
                  const key = window.localStorage.key(i);
                  if (key?.startsWith("roxena-draft:"))
                    drafts[key] = window.localStorage.getItem(key) || "";
                }
              } catch {
                /* export the readable drafts */
              }
              void api.exportBytes(
                "SimpleLexEditor-Notfallentwuerfe.json",
                new TextEncoder().encode(JSON.stringify(drafts, null, 2)),
              );
            }}
          >
            Verfügbare Entwürfe exportieren
          </button>
        </div>
        <details>
          <summary>Technische Meldung</summary>
          <pre>{this.state.error.message}</pre>
        </details>
      </main>
    );
  }
}
