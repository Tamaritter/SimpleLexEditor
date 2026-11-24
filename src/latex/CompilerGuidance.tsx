import {
  compilerActionLabels,
  compilerHelp,
  type CompilerAction,
} from "./compilerHelp";
import { resolveDiagnosticFile, type Diagnostic } from "../app/workspace";

export function CompilerActions({
  diagnostic,
  paths,
  main,
  disabled,
  onAction,
  review = false,
}: {
  diagnostic: Diagnostic;
  paths: string[];
  main: string;
  disabled: boolean;
  onAction: (action: CompilerAction, diagnostic: Diagnostic) => void;
  review?: boolean;
}) {
  const help = compilerHelp(diagnostic);
  const actions = help.actions.filter(
    (action) =>
      !(review && action === "repair") &&
      !(
        action === "source" &&
        (!diagnostic.line ||
          !resolveDiagnosticFile(diagnostic.file, paths, main))
      ),
  );
  if (
    !help.secondary &&
    (diagnostic.command ||
      help.kind === "file" ||
      help.kind === "conflict" ||
      help.kind === "braces")
  )
    actions.push("search");
  return (
    <div className="compiler-actions">
      {actions.map((action) => (
        <button
          key={action}
          disabled={disabled}
          onClick={() => onAction(action, diagnostic)}
        >
          {compilerActionLabels[action]}
        </button>
      ))}
    </div>
  );
}

export function CompilerGuidance({
  issues,
  paths,
  main,
  disabled,
  onAction,
}: {
  issues: Diagnostic[];
  paths: string[];
  main: string;
  disabled: boolean;
  onAction: (action: CompilerAction, diagnostic: Diagnostic) => void;
}) {
  const causes = issues.filter((d) => !compilerHelp(d).secondary);
  return (
    <div className="compiler-guidance">
      {(causes.length ? causes : issues).map((d, i) => {
        const help = compilerHelp(d);
        return (
          <section
            key={`${d.message}:${d.file}:${d.line}`}
            className={`compiler-guide ${d.severity}`}
          >
            <h3>
              {i === 0 && d.severity === "error" ? "Zuerst beheben: " : ""}
              {help.title}
            </h3>
            <p>{help.explanation}</p>
            <details>
              <summary>
                Compiler-Meldung
                {d.line
                  ? ` · ${resolveDiagnosticFile(d.file, paths, main) || d.file || main}:${d.line}`
                  : ""}
              </summary>
              <pre>
                {d.message}
                {d.context ? "\n" + d.context : ""}
              </pre>
            </details>
            <CompilerActions
              diagnostic={d}
              paths={paths}
              main={main}
              disabled={disabled}
              onAction={onAction}
              review
            />
          </section>
        );
      })}
    </div>
  );
}
