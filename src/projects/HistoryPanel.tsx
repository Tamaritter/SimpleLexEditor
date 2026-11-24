import { useEffect, useState } from "react";
import { History, LoaderCircle, FileClock } from "lucide-react";
import { api, type BackupVersion } from "../core/api";
export function HistoryPanel({
  path,
  onRestore,
}: {
  path: string;
  onRestore: (content: string) => Promise<void>;
}) {
  const [versions, setVersions] = useState<BackupVersion[]>([]),
    [selected, setSelected] = useState(""),
    [content, setContent] = useState(""),
    [draft, setDraft] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [restoring, setRestoring] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.backups(path), api.recover(path)])
      .then(([versions, draft]) => {
        if (cancelled) return;
        setVersions(versions);
        setDraft(draft?.content ?? null);
        setSelected(draft ? "draft" : versions[0]?.id || "");
      })
      .catch((error) => setError(String(error)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  useEffect(() => {
    let cancelled = false;
    if (selected === "draft") {
      setContent(draft || "");
      return;
    }
    if (!selected) return;
    setLoading(true);
    void api
      .backup(path, selected)
      .then((value) => {
        if (!cancelled) setContent(value);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, selected, draft]);
  return (
    <div className="history-panel">
      <p className="muted-help">
        SimpleLexEditor bewahrt die letzten 20 gespeicherten Fassungen dieser
        Datei auf. Eine Wiederherstellung übernimmt den Text in den Editor;
        deine aktuelle Fassung wird vorher gesichert.
      </p>
      {error && (
        <p role="alert" className="export-warning">
          {error}
        </p>
      )}
      <div className="history-workspace">
        <div className="history-list">
          {draft !== null && (
            <button
              aria-pressed={selected === "draft"}
              onClick={() => setSelected("draft")}
            >
              <FileClock size={16} />
              <span>
                <strong>Wiederherstellungsentwurf</strong>
                <small>Zuletzt gesicherter ungespeicherter Text</small>
              </span>
            </button>
          )}
          {versions.map((version) => (
            <button
              aria-pressed={selected === version.id}
              key={version.id}
              onClick={() => setSelected(version.id)}
            >
              <History size={15} />
              <span>
                <strong>
                  {new Date(version.modifiedMs).toLocaleString("de-DE")}
                </strong>
                <small>
                  {Math.max(1, Math.round(version.bytes / 1024))} KB
                </small>
              </span>
            </button>
          ))}
          {!loading && !versions.length && draft === null && (
            <p className="muted-help">
              Noch keine Sicherung vorhanden. Beim nächsten Speichern einer
              Änderung wird die vorherige Fassung gesichert.
            </p>
          )}
        </div>
        <div className="history-preview">
          {loading ? (
            <div className="workspace-empty">
              <LoaderCircle size={20} className="spin" />
            </div>
          ) : (
            <textarea
              readOnly
              aria-label="Sicherungsvorschau"
              value={content}
              spellCheck={false}
            />
          )}
        </div>
      </div>
      <div className="modal-footer">
        <span>{path}</span>
        <button
          className="button primary"
          disabled={!selected || loading || restoring}
          onClick={() => {
            setRestoring(true);
            void onRestore(content)
              .catch((error) => setError(String(error)))
              .finally(() => setRestoring(false));
          }}
        >
          Fassung im Editor wiederherstellen
        </button>
      </div>
    </div>
  );
}
