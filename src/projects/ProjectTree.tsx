import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image,
  Link2,
  Monitor,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { FileEntry } from "../core/model";
import { parentPath, visibleEntries, type EntryAction } from "./projectFiles";
type Props = {
  name: string;
  root: string;
  files: FileEntry[];
  active: string;
  main: string;
  dirty: string[];
  disabled: boolean;
  canRestore: boolean;
  onAction: (action: EntryAction, path: string, directory: boolean) => void;
};
export function ProjectTree({
  name,
  root,
  files,
  active,
  main,
  dirty,
  disabled,
  canRestore,
  onAction,
}: Props) {
  const [collapsed, setCollapsed] = useState(new Set<string>()),
    [rootCollapsed, setRootCollapsed] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    path: string;
    directory: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null),
    previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setCollapsed(new Set());
    setRootCollapsed(false);
    setMenu(null);
  }, [root]);
  useEffect(() => {
    setRootCollapsed(false);
    setCollapsed(
      (current) =>
        new Set([...current].filter((path) => !active.startsWith(path + "/"))),
    );
  }, [active]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        previousFocus.current?.focus();
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [
            ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) || []),
          ],
          index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    const frame = requestAnimationFrame(() =>
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus(),
    );
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      cancelAnimationFrame(frame);
    };
  }, [menu]);
  const showMenu = (
    event: React.MouseEvent | React.KeyboardEvent,
    path: string,
    directory: boolean,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    previousFocus.current = event.currentTarget as HTMLElement;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = "clientX" in event ? event.clientX : rect.left + 20,
      y = "clientY" in event ? event.clientY : rect.bottom;
    setMenu({
      x: Math.min(x, window.innerWidth - 270),
      y: Math.max(8, Math.min(y, window.innerHeight - 405)),
      path,
      directory,
    });
  };
  const keyboardMenu = (
    event: React.KeyboardEvent,
    path: string,
    directory: boolean,
  ) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
      showMenu(event, path, directory);
  };
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const actions: {
    id: EntryAction;
    label: string;
    icon: typeof Folder;
    separator?: boolean;
    disabled?: boolean;
  }[] = menu
    ? [
        ...(!menu.directory
          ? [{ id: "open" as const, label: "Datei öffnen", icon: FileText }]
          : []),
        { id: "new-file", label: "Neue Datei …", icon: FilePlus2 },
        { id: "new-folder", label: "Neuer Ordner …", icon: FolderPlus },
        ...(!menu.directory && menu.path.toLowerCase().endsWith(".tex")
          ? [
              {
                id: "main" as const,
                label:
                  menu.path === main
                    ? "Vorschaudokument · aktuell"
                    : "Als Vorschaudokument verwenden",
                icon: Monitor,
                separator: true,
                disabled: menu.path === main,
              },
              ...(main && main !== menu.path
                ? [
                    {
                      id: "include" as const,
                      label: "Im Hauptdokument einbinden …",
                      icon: Link2,
                    },
                  ]
                : []),
            ]
          : []),
        ...(menu.path
          ? [
              {
                id: "rename" as const,
                label: "Umbenennen / verschieben …",
                icon: Pencil,
                separator: true,
              },
              {
                id: "trash" as const,
                label: "In Projektpapierkorb …",
                icon: Trash2,
              },
            ]
          : [
              {
                id: "open-project" as const,
                label: "Anderes Projekt öffnen …",
                icon: FolderOpen,
                separator: true,
              },
            ]),
        {
          id: "reveal",
          label: "Im Dateimanager anzeigen",
          icon: FolderOpen,
          separator: true,
        },
        { id: "copy", label: "Projektpfad kopieren", icon: Copy },
        { id: "refresh", label: "Dateiliste aktualisieren", icon: RefreshCw },
        ...(canRestore
          ? [
              {
                id: "restore" as const,
                label: "Letzte Entfernung rückgängig",
                icon: RotateCcw,
                separator: true,
              },
            ]
          : []),
      ]
    : [];
  return (
    <div
      className="project-tree"
      onContextMenu={(event) => showMenu(event, "", true)}
    >
      <button
        className="folder-root"
        aria-expanded={!rootCollapsed}
        aria-label={`${name} Ordnerstruktur`}
        title={root}
        onClick={() => setRootCollapsed((v) => !v)}
        onContextMenu={(event) => showMenu(event, "", true)}
        onKeyDown={(event) => keyboardMenu(event, "", true)}
      >
        {rootCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <FolderOpen size={14} />
        <span>{name || "Projekt"}</span>
      </button>
      <div className="file-tree">
        {!rootCollapsed &&
          visibleEntries(files, collapsed).map((file) =>
            file.directory ? (
              <button
                className="directory-row"
                aria-expanded={!collapsed.has(file.path)}
                key={file.path}
                style={{
                  paddingLeft: 16 + (file.path.split("/").length - 1) * 12,
                }}
                onClick={() => toggle(file.path)}
                onContextMenu={(event) => showMenu(event, file.path, true)}
                onKeyDown={(event) => keyboardMenu(event, file.path, true)}
                title={file.path}
              >
                {collapsed.has(file.path) ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <Folder size={14} />
                <span>{file.name}</span>
              </button>
            ) : (
              <button
                className={`file-row ${active === file.path ? "selected" : ""}`}
                aria-current={active === file.path ? "page" : undefined}
                key={file.path}
                style={{
                  paddingLeft: 31 + (file.path.split("/").length - 1) * 12,
                }}
                onClick={() => onAction("open", file.path, false)}
                onContextMenu={(event) => showMenu(event, file.path, false)}
                onKeyDown={(event) => keyboardMenu(event, file.path, false)}
                title={`${file.path}${file.path === main ? " — wird für die Vorschau kompiliert" : ""}`}
              >
                {file.path.toLowerCase().endsWith(".tex") ? (
                  <FileCode2 size={14} />
                ) : /\.(png|jpg|pdf)$/i.test(file.path) ? (
                  <Image size={14} />
                ) : (
                  <FileText size={14} />
                )}
                <span>{file.name}</span>
                {file.path === main && <span className="main-tag">Haupt</span>}
                {dirty.includes(file.path) && <span className="unsaved-dot" />}
              </button>
            ),
          )}
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="file-context-menu"
          role="menu"
          aria-label="Datei- und Ordneraktionen"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="context-menu-title" title={menu.path}>
            {menu.path || name}
          </div>
          {actions.map((action) => (
            <button
              role="menuitem"
              className={`${action.separator ? "menu-separator" : ""} ${action.id === "trash" ? "danger-action" : ""}`}
              key={action.id}
              disabled={
                action.disabled ||
                (disabled && !["copy", "open", "reveal"].includes(action.id))
              }
              onClick={() => {
                const target =
                  action.id === "new-file" || action.id === "new-folder"
                    ? menu.directory
                      ? menu.path
                      : parentPath(menu.path)
                    : menu.path;
                const directory = menu.directory;
                setMenu(null);
                onAction(action.id, target, directory);
              }}
            >
              <action.icon size={14} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
