import { defaultSettings, type Settings } from "./model";
export const localStore = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};
export function validatedSettings(raw: string | null): Settings {
  let value: Partial<Settings> = {};
  try {
    value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object") value = {};
  } catch {
    /* defaults */
  }
  return {
    theme: ["light", "dark", "system"].includes(value.theme || "")
      ? value.theme!
      : defaultSettings.theme,
    fontSize:
      typeof value.fontSize === "number" &&
      [11, 12, 13, 14, 15, 16, 18, 20].includes(value.fontSize)
        ? value.fontSize
        : defaultSettings.fontSize,
    autoSave:
      typeof value.autoSave === "boolean"
        ? value.autoSave
        : defaultSettings.autoSave,
    lineWrap:
      typeof value.lineWrap === "boolean"
        ? value.lineWrap
        : defaultSettings.lineWrap,
    engine: ["pdflatex", "xelatex", "lualatex", "tectonic"].includes(
      value.engine || "",
    )
      ? value.engine!
      : defaultSettings.engine,
    timeoutSeconds:
      typeof value.timeoutSeconds === "number" &&
      Number.isInteger(value.timeoutSeconds) &&
      value.timeoutSeconds >= 30 &&
      value.timeoutSeconds <= 1800
        ? value.timeoutSeconds
        : 180,
    toolchainDirectory:
      typeof value.toolchainDirectory === "string"
        ? value.toolchainDirectory
        : "",
  };
}
export type RecoveryDraft = {
  path?: string;
  base: string;
  content: string;
  updated: string;
};
export function draftText(base: string, content: string) {
  return JSON.stringify({
    format: "roxena-draft-2",
    base,
    content,
    updated: Date.now().toString(),
  });
}
export function restoreDraft(
  saved: string,
  local: string | null,
  disk: RecoveryDraft | null,
) {
  let draft: RecoveryDraft | null = disk;
  let legacy = false;
  if (local !== null) {
    try {
      const parsed = JSON.parse(local);
      if (
        parsed?.format === "roxena-draft-2" &&
        typeof parsed.base === "string" &&
        typeof parsed.content === "string"
      ) {
        if (!draft || Number(parsed.updated) > Number(draft.updated) / 1e6)
          draft = {
            base: parsed.base,
            content: parsed.content,
            updated: parsed.updated,
          };
      } else throw Error("legacy");
    } catch {
      if (!disk) {
        draft = { base: saved, content: local, updated: "0" };
        legacy = true;
      }
    }
  }
  if (!draft || draft.content === saved)
    return { content: saved, saved, conflict: false };
  return {
    content: draft.content,
    saved: draft.base,
    conflict: legacy || saved !== draft.base,
  };
}
