import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const components = [];
const texts = new Map();
async function add(
  name,
  version,
  license,
  directory,
  extra = [],
  repository = "",
) {
  const candidates = (await fs.readdir(directory)).filter((name) =>
    /^(licen[cs]e|copying|notice|ofl|copyright|unlicense)([-._]|$)/i.test(name),
  );
  if (name === "pdfjs-dist") {
    for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
      for (const file of await fs.readdir(path.join(directory, folder))) {
        if (/^LICENSE/.test(file)) extra.push(path.join(folder, file));
      }
    }
  }
  const ids = [];
  for (const filename of [...new Set([...candidates, ...extra])]) {
    const file = path.resolve(directory, filename);
    let content;
    try {
      if (!(await fs.stat(file)).isFile()) continue;
      content = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    if (content.length > 250000)
      throw Error(`Unexpected license file size: ${name}`);
    const id = createHash("sha256").update(content).digest("hex").slice(0, 16);
    texts.set(id, content.trim());
    ids.push(id);
  }
  if (!ids.length && repository) {
    const match = String(repository).match(
      /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?\/?$/,
    );
    if (match) {
      const response = await fetch(
        `https://api.github.com/repos/${match[1]}/${match[2]}/license`,
        {
          headers: {
            "user-agent": "SimpleLexEditor-notice-verification",
            accept: "application/vnd.github+json",
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (response.ok) {
        const record = await response.json();
        if (record.content) {
          const content = Buffer.from(record.content, "base64").toString(
            "utf8",
          );
          const id = createHash("sha256")
            .update(content)
            .digest("hex")
            .slice(0, 16);
          texts.set(id, content.trim());
          ids.push(id);
        }
      }
    }
  }
  if (!ids.length && license === "MPL-2.0") {
    const response = await fetch(
      "https://raw.githubusercontent.com/spdx/license-list-data/main/text/MPL-2.0.txt",
      { signal: AbortSignal.timeout(15000) },
    );
    if (response.ok) {
      const content = await response.text();
      const id = createHash("sha256")
        .update(content)
        .digest("hex")
        .slice(0, 16);
      texts.set(id, content.trim());
      ids.push(id);
    }
  }
  if (!ids.length)
    throw Error(
      `No license text found for ${name}@${version} (${repository}); review before distribution.`,
    );
  components.push({
    name,
    version,
    license: license || "See license text",
    texts: ids,
    source: directory.includes("node_modules")
      ? `https://www.npmjs.com/package/${name}/v/${version}`
      : `https://crates.io/crates/${name}/${version}`,
  });
}
const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location || entry.dev || entry.optional) continue;
  const manifest = JSON.parse(
    await fs.readFile(path.join(location, "package.json"), "utf8"),
  );
  await add(
    manifest.name,
    manifest.version,
    manifest.license,
    location,
    [],
    typeof manifest.repository === "string"
      ? manifest.repository
      : manifest.repository?.url,
  );
}
const host = execFileSync("rustc", ["-vV"], {
  encoding: "utf8",
  windowsHide: true,
}).match(/^host:\s*(.+)$/m)?.[1];
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--filter-platform",
      host,
      "--manifest-path",
      "src-tauri/Cargo.toml",
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 30 * 1024 * 1024 },
  ),
);
const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const reached = new Set();
function visit(id) {
  if (reached.has(id)) return;
  reached.add(id);
  for (const dependency of nodes.get(id)?.deps || []) visit(dependency.pkg);
}
visit(metadata.resolve.root);
for (const pkg of metadata.packages) {
  if (!reached.has(pkg.id) || !pkg.source) continue;
  await add(
    pkg.name,
    pkg.version,
    pkg.license,
    path.dirname(pkg.manifest_path),
    pkg.license_file ? [pkg.license_file] : [],
    pkg.repository,
  );
}
components.sort((a, b) => a.name.localeCompare(b.name));
const output = [
  "SIMPLELEXEDITOR — THIRD-PARTY NOTICES",
  "Generated from the locked production dependencies for Windows x64.",
  "These notices concern third-party components and do not grant a license to SimpleLexEditor itself.",
  "Unmodified third-party source distributions are available at the component source links below.",
  "",
  "BUNDLED TEX DISTRIBUTION",
  "TeX Live (TinyTeX-2, scheme-full) is distributed unmodified alongside SimpleLexEditor.",
  "Source and binary distribution: https://github.com/rstudio/tinytex-releases",
  "TeX Live licensing and corresponding source information: https://tug.org/texlive/copying.html",
  "Individual package licenses and source references are retained in TinyTeX/tlpkg/texlive.tlpdb.",
  "The distribution's LICENSE.TL, LICENSE.CTAN and package notices are retained in the bundled tree.",
  "No blanket SimpleLexEditor license applies to these third-party TeX components.",
  "",
  ...components.map(
    (item) =>
      `${item.name}@${item.version}\nDeclared license: ${item.license}\nSource: ${item.source}\nLicense text: ${item.texts.join(", ")}\n`,
  ),
  "",
  ...[...texts].map(
    ([id, text]) =>
      `================ LICENSE ${id} ================\n${text}\n`,
  ),
];
await fs.writeFile("THIRD_PARTY_NOTICES.txt", output.join("\n"));
console.log(
  `Collected notices: ${components.length} components, ${texts.size} license texts.`,
);
