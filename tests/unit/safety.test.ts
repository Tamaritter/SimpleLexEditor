import { describe, it, expect } from "vitest";
import {
  validatedSettings,
  restoreDraft,
  draftText,
} from "../../src/core/safety";
describe("persistent editor safety", () => {
  it("repairs corrupt and unsupported settings before rendering", () => {
    expect(validatedSettings("null").engine).toBe("pdflatex");
    expect(validatedSettings("not json").fontSize).toBe(14);
    const settings = validatedSettings(
      JSON.stringify({
        engine: "cmd.exe",
        fontSize: 99999,
        timeoutSeconds: -1,
        autoSave: "false",
        theme: "unknown",
        toolchainDirectory: {},
      }),
    );
    expect(settings).toMatchObject({
      engine: "pdflatex",
      fontSize: 14,
      timeoutSeconds: 180,
      autoSave: true,
      theme: "dark",
      toolchainDirectory: "",
    });
  });
  it("restores drafts without silently replacing externally changed files", () => {
    const local = draftText("old", "my changes");
    expect(restoreDraft("old", local, null)).toMatchObject({
      saved: "old",
      content: "my changes",
      conflict: false,
    });
    expect(restoreDraft("external", local, null)).toMatchObject({
      saved: "old",
      content: "my changes",
      conflict: true,
    });
    expect(restoreDraft("external", "legacy unsaved", null).conflict).toBe(
      true,
    );
  });
  it("prefers the newest durable draft and ignores already-saved content", () => {
    const disk = { base: "a", content: "disk", updated: "1800000000000000000" };
    const local = JSON.stringify({
      format: "roxena-draft-2",
      base: "a",
      content: "new local",
      updated: "1800000000001",
    });
    expect(restoreDraft("a", local, disk).content).toBe("new local");
    expect(restoreDraft("disk", null, disk)).toMatchObject({
      content: "disk",
      saved: "disk",
      conflict: false,
    });
  });
});
