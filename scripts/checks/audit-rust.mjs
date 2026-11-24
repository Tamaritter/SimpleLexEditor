import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const host = execFileSync("rustc", ["-vV"], {
  encoding: "utf8",
  windowsHide: true,
}).match(/^host:\s*(.+)$/m)?.[1];
if (!host) throw Error("Rust host target unavailable");
const lock = await fs.readFile("src-tauri/Cargo.lock", "utf8");
const registry = new Set(
  [
    ...lock.matchAll(
      /\[\[package\]\]\s+name = "([^"]+)"\s+version = "([^"]+)"\s+source = "registry\+[^\n]+/g,
    ),
  ].map((match) => `${match[1]}@${match[2]}`),
);
const tree = execFileSync(
  "cargo",
  [
    "tree",
    "--locked",
    "--target",
    host,
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--prefix",
    "none",
    "--format",
    "{p}",
  ],
  { encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
);
const packages = [
  ...new Map(
    [...tree.matchAll(/^([\w-]+) v([^\s]+)/gm)]
      .filter((match) => registry.has(`${match[1]}@${match[2]}`))
      .map((match) => [
        `${match[1]}@${match[2]}`,
        { name: match[1], version: match[2] },
      ]),
  ).values(),
];
if (!packages.length)
  throw Error("Dependency graph is empty; refusing to report a clean audit.");
const findings = [];
for (let i = 0; i < packages.length; i += 100) {
  const batch = packages.slice(i, i + 100);
  const response = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: batch.map((pkg) => ({
        package: { name: pkg.name, ecosystem: "crates.io" },
        version: pkg.version,
      })),
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw Error(`OSV query failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (
    !Array.isArray(payload.results) ||
    payload.results.length !== batch.length
  )
    throw Error("Incomplete OSV audit response");
  payload.results.forEach((result, index) => {
    for (const advisory of result.vulns || [])
      findings.push({ ...batch[index], id: advisory.id });
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  target: host,
  packages: packages.length,
  findings,
};
await fs.mkdir(".tools", { recursive: true });
await fs.writeFile(
  ".tools/rust-security-audit.json",
  JSON.stringify(report, null, 2),
);
console.log(
  `OSV audit: ${packages.length} Rust dependencies for ${host}; ${findings.length} advisory matches.`,
);
for (const finding of findings)
  console.log(
    `${finding.name}@${finding.version}: https://osv.dev/vulnerability/${finding.id}`,
  );
if (findings.length) process.exitCode = 1;
