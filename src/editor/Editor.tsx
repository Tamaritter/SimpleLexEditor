import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import {
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import type { Settings } from "../core/model";
import {
  ensurePreamble,
  scientificInsertionRange,
  formatScientificCode,
  parseBib,
  parseLabels,
  type ScientificInsert,
} from "../research/scientific";
import { scientificCompletionNames } from "../math/mathCatalog";
export type EditorHandle = {
  insert: (text: string) => void;
  wrap: (before: string, after: string) => void;
  goTo: (line: number, column?: number, length?: number) => void;
  focus: () => void;
  selection: () => { source: string; from: number; to: number };
  insertScientific: (item: ScientificInsert) => void;
};
type Props = {
  path: string;
  content: string;
  settings: Settings;
  onChange: (content: string) => void;
  onCursor: (line: number, column: number) => void;
  completionSources?: Record<string, string>;
};
const wrapCompartment = new Compartment();
const completions = [
  "section",
  "subsection",
  "subsubsection",
  "chapter",
  "textbf",
  "textit",
  "emph",
  "label",
  "ref",
  "cite",
  "begin",
  "end",
  "frac",
  "sqrt",
  "sum",
  "int",
  "infty",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "theta",
  "lambda",
  "pi",
  "sigma",
  "omega",
  "usepackage",
  "includegraphics",
  "input",
  "include",
  "caption",
  "footnote",
  "maketitle",
  "tableofcontents",
  "newpage",
  "centering",
  "item",
  "title",
  "author",
  "date",
];
const highlighting = HighlightStyle.define([
  { tag: [tags.keyword, tags.tagName], color: "var(--syntax-command)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.string, tags.attributeValue], color: "var(--syntax-string)" },
  { tag: [tags.brace, tags.bracket], color: "var(--syntax-brace)" },
  { tag: [tags.number, tags.atom], color: "var(--syntax-number)" },
]);
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { path, content, settings, onChange, onCursor, completionSources = {} },
  ref,
) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const extensions = useRef<Extension[]>([]);
  const callbacks = useRef({
    onChange,
    onCursor,
    completionSources,
    lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
  });
  callbacks.current = {
    onChange,
    onCursor,
    completionSources,
    lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
  };
  const initial = useRef({ path, content, settings });
  useEffect(() => {
    const configuration: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      indentOnInput(),
      bracketMatching(),
      syntaxHighlighting(highlighting),
      StreamLanguage.define(stex),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      autocompletion({
        override: [
          (context) => {
            const target = context.matchBefore(
              /\\(?:cite|citet|citep|textcite|parencite|autocite|ref|eqref|pageref|autoref)\{[^}]*$/,
            );
            if (target) {
              const citation =
                /^\\(?:cite|citet|citep|textcite|parencite|autocite)\{/.test(
                  target.text,
                );
              const from =
                target.from +
                Math.max(
                  target.text.lastIndexOf("{"),
                  target.text.lastIndexOf(","),
                ) +
                1;
              const sources = {
                ...callbacks.current.completionSources,
                "__active.tex": context.state.doc.toString(),
              };
              const entries = citation
                ? Object.entries(sources)
                    .filter(([p]) => p.endsWith(".bib"))
                    .flatMap(([file, text]) =>
                      parseBib(text, file).map((entry) => ({
                        label: entry.key,
                        detail: entry.year,
                        info: `${entry.title} — ${entry.author}`,
                        type: "reference",
                      })),
                    )
                : Object.entries(sources)
                    .filter(([p]) => p.endsWith(".tex"))
                    .flatMap(([file, text]) =>
                      parseLabels(text, file).map((entry) => ({
                        label: entry.key,
                        detail:
                          file === "__active.tex" ? "Aktuelles Dokument" : file,
                        type: "reference",
                      })),
                    );
              return {
                from,
                options: [
                  ...new Map(entries.map((e) => [e.label, e])).values(),
                ],
                validFor: /^[\w:.-]*$/,
              };
            }
            const environment = context.matchBefore(
              /\\(?:begin|end)\{[a-zA-Z*]*$/,
            );
            if (environment)
              return {
                from: environment.from + environment.text.indexOf("{") + 1,
                options: [
                  "equation",
                  "equation*",
                  "align",
                  "align*",
                  "aligned",
                  "gather",
                  "multline",
                  "cases",
                  "pmatrix",
                  "bmatrix",
                  "matrix",
                  "theorem",
                  "lemma",
                  "definition",
                  "proof",
                  "abstract",
                  "figure",
                  "table",
                  "itemize",
                  "enumerate",
                ].map((label) => ({ label, type: "keyword" })),
              };
            const word = context.matchBefore(/\\[a-zA-Z]*/);
            return word
              ? {
                  from: word.from,
                  options: [
                    ...new Set([
                      ...completions,
                      ...scientificCompletionNames,
                      "eqref",
                      "autoref",
                      "pageref",
                      "newtheorem",
                      "theoremstyle",
                      "bibliography",
                      "bibliographystyle",
                      "addbibresource",
                      "printbibliography",
                      "citet",
                      "citep",
                      "textcite",
                      "parencite",
                      "qedhere",
                      "operatorname",
                      "mathbb",
                      "mathcal",
                      "mathbf",
                    ]),
                  ].map((s) => ({
                    label: "\\" + s,
                    type: "keyword",
                  })),
                }
              : null;
          },
        ],
      }),
      wrapCompartment.of(
        initial.current.settings.lineWrap ? EditorView.lineWrapping : [],
      ),
      EditorView.contentAttributes.of({
        "aria-label": "LaTeX-Code",
        spellcheck: "false",
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged)
          callbacks.current.onChange(
            update.state.doc
              .toString()
              .replace(/\n/g, callbacks.current.lineEnding),
          );
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          callbacks.current.onCursor(line.number, pos - line.from + 1);
        }
      }),
    ];
    extensions.current = configuration;
    const state = EditorState.create({
      doc: initial.current.content,
      extensions: configuration,
    });
    view.current = new EditorView({ state, parent: host.current! });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);
  const previous = useRef(path);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    if (previous.current !== path) {
      states.current.set(previous.current, editor.state);
      const saved = states.current.get(path);
      if (saved && saved.doc.toString() === content.replace(/\r\n/g, "\n"))
        editor.setState(saved);
      else
        editor.setState(
          EditorState.create({ doc: content, extensions: extensions.current }),
        );
      previous.current = path;
    } else if (editor.state.doc.toString() !== content.replace(/\r\n/g, "\n"))
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: content },
      });
  }, [path, content]);
  useEffect(() => {
    view.current?.dispatch({
      effects: wrapCompartment.reconfigure(
        settings.lineWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [settings.lineWrap, path]);
  useImperativeHandle(
    ref,
    () => ({
      insert(text) {
        const editor = view.current!;
        editor.dispatch(editor.state.replaceSelection(text));
        editor.focus();
      },
      selection() {
        const state = view.current!.state;
        return {
          source: state.doc.toString(),
          from: state.selection.main.from,
          to: state.selection.main.to,
        };
      },
      insertScientific(item) {
        const editor = view.current!,
          state = editor.state,
          source = state.doc.toString();
        const selection = scientificInsertionRange(
          source,
          state.selection.main.from,
          state.selection.main.to,
          item,
        );
        const code = formatScientificCode(item, source, selection.from);
        const prepared = ensurePreamble(source, item);
        const offset =
          prepared.added && prepared.at <= selection.from
            ? prepared.added.length
            : 0;
        const from = selection.from + offset,
          to = selection.to + offset;
        const next =
          prepared.source.slice(0, from) + code + prepared.source.slice(to);
        editor.dispatch({
          changes: { from: 0, to: source.length, insert: next },
          selection: { anchor: from + code.length },
          userEvent: "input",
        });
        editor.focus();
      },
      wrap(before, after) {
        const editor = view.current!,
          selection = editor.state.selection.main;
        const text =
          editor.state.sliceDoc(selection.from, selection.to) || "Text";
        editor.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: before + text + after,
          },
          selection: {
            anchor: selection.from + before.length,
            head: selection.from + before.length + text.length,
          },
        });
        editor.focus();
      },
      goTo(n, column = 1, length = 0) {
        const editor = view.current!;
        const line = editor.state.doc.line(
          Math.max(1, Math.min(n, editor.state.doc.lines)),
        );
        const anchor =
          line.from + Math.max(0, Math.min(column - 1, line.length));
        editor.dispatch({
          selection: {
            anchor,
            head: Math.min(editor.state.doc.length, anchor + length),
          },
          effects: EditorView.scrollIntoView(anchor, { y: "center" }),
        });
        editor.focus();
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );
  return (
    <div
      ref={host}
      className="code-editor"
      style={{ fontSize: settings.fontSize }}
    />
  );
});
