import { maskTex } from "../editor/texAnalysis";
import { inspectResearchProject } from "../research/research";

export type AutomaticRepairStep = {
  id: string;
  description: string;
  apply: () => Promise<void>;
};
export type AutomaticRepairResult = {
  status: "success" | "blocked" | "cancelled" | "limit";
  rounds: number;
};

/** One user action can repair successive compiler causes; every round is fresh. */
export async function runAutomaticRepairs<T extends { success: boolean }>(
  adapter: {
    compile: () => Promise<T>;
    next: (report: T) => Promise<AutomaticRepairStep | null>;
    cancelled: () => boolean;
    progress: (message: string) => void;
  },
  maximumRounds = 24,
): Promise<AutomaticRepairResult> {
  const applied = new Set<string>();
  let rounds = 0;
  for (;;) {
    if (adapter.cancelled()) return { status: "cancelled", rounds };
    adapter.progress(
      rounds
        ? `Korrektur ${rounds} wird geprüft und die PDF aktualisiert …`
        : "Dokument wird kompiliert und auf reparierbare Fehler geprüft …",
    );
    const report = await adapter.compile();
    if (adapter.cancelled()) return { status: "cancelled", rounds };
    if (report.success) return { status: "success", rounds };
    if (rounds >= maximumRounds) return { status: "limit", rounds };
    const step = await adapter.next(report);
    if (adapter.cancelled()) return { status: "cancelled", rounds };
    if (!step || applied.has(step.id)) return { status: "blocked", rounds };
    applied.add(step.id);
    adapter.progress(step.description);
    await step.apply();
    rounds++;
  }
}

export function repairFingerprint(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

export function automaticMainDocument(
  sources: Record<string, string>,
  paths: string[],
  main: string,
) {
  if (/\\documentclass\b/.test(maskTex(sources[main] || ""))) return null;
  const candidates = Object.keys(sources).filter(
    (file) =>
      file !== main &&
      /\\documentclass\b/.test(maskTex(sources[file])) &&
      /\\begin\s*\{document\}/.test(maskTex(sources[file])),
  );
  if (candidates.length > 8) return null;
  const parents = candidates.filter((file) =>
    inspectResearchProject(file, sources, paths).files.includes(main),
  );
  return parents.length === 1 ? parents[0] : null;
}
