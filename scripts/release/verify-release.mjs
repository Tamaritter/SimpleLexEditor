import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const tauri = JSON.parse(
  await fs.readFile("src-tauri/tauri.conf.json", "utf8"),
);
const rust = await fs.readFile("src-tauri/Cargo.toml", "utf8");
const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
if (
  pkg.version !== tauri.version ||
  !rust.includes(`version = "${pkg.version}"`) ||
  lock.version !== pkg.version
)
  throw Error("Release versions do not match");
if (!/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw Error("Stable version number required");
if (
  !tauri.app.security.csp ||
  /['"]unsafe-eval['"]/.test(tauri.app.security.csp)
)
  throw Error(
    "Production content security policy missing or unsafe-eval enabled",
  );
const capability = JSON.parse(
  await fs.readFile("src-tauri/capabilities/default.json", "utf8"),
);
if (capability.remote)
  throw Error("Remote origins must not receive desktop permissions");
const texLock = JSON.parse(
  await fs.readFile("scripts/build/tex-runtime.lock.json", "utf8"),
);
if (tauri.bundle.windows?.webviewInstallMode?.type !== "offlineInstaller")
  throw Error(
    "The complete installer must include offline WebView2 installation",
  );
const hooks = await fs.readFile("src-tauri/installer-hooks.nsh", "utf8");
if (!hooks.includes(texLock.sha256))
  throw Error("Installer TeX digest is out of date");
if ((await hashFile("src-tauri/resources/tex-runtime.exe")) !== texLock.sha256)
  throw Error("Bundled TeX archive differs from the pinned distribution");
const built = await fs.readFile("src-tauri/target/release/simplelexeditor.exe");
const portable = await fs.readFile(
  "release/SimpleLexEditor-portable/simplelexeditor.exe",
);
if (!built.equals(portable))
  throw Error("Portable binary differs from the tested build");
const sums = await fs.readFile("release/SHA256SUMS.txt", "utf8");
const checksumNames = new Set();
const checksumLines = sums.trim().split(/\r?\n/);
if (checksumLines.length !== 2)
  throw Error("Expected exactly two download checksums");
for (const line of checksumLines) {
  const [hash, name] = line.split(/\s+/);
  if (
    !["SimpleLexEditor-Setup.exe", "SimpleLexEditor-portable.zip"].includes(
      name,
    ) ||
    checksumNames.has(name)
  )
    throw Error("Unexpected release checksum entry");
  checksumNames.add(name);
  if ((await hashFile(path.join("release", name))) !== hash)
    throw Error(`Checksum mismatch: ${name}`);
}
const expected = [
  "simplelexeditor.exe",
  "WebView2Loader.dll",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
  "LIESMICH.txt",
  "tex-runtime.exe",
];
const sources = new Map();
for (const name of expected) {
  const file = path.join("release/SimpleLexEditor-portable", name);
  sources.set(`SimpleLexEditor-portable/${name}`, {
    hash: await hashFile(file),
    size: (await fs.stat(file)).size,
  });
}
if (
  sources.get("SimpleLexEditor-portable/tex-runtime.exe").hash !==
  texLock.sha256
)
  throw Error("Portable TeX payload differs from the pinned distribution");
for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.txt"]) {
  if (
    sources.get(`SimpleLexEditor-portable/${name}`).hash !==
    (await hashFile(name))
  )
    throw Error(`Portable license file differs from the source: ${name}`);
}
// Validate the multi-gigabyte portable archive without loading or expanding it
// in memory. Reject duplicate/extra entries and bound every entry by its source.
const entries = new Set();
const completed = new Set();
let zipError;
const unzip = new Unzip((file) => {
  const source = sources.get(file.name);
  if (!source || entries.has(file.name)) {
    zipError = Error("Unexpected files in portable archive");
    return;
  }
  entries.add(file.name);
  const hash = createHash("sha256");
  let size = 0;
  file.ondata = (error, data, final) => {
    if (error) {
      zipError = error;
      return;
    }
    size += data.length;
    if (size > source.size) {
      zipError = Error(`Oversized portable entry: ${file.name}`);
      file.terminate();
      return;
    }
    hash.update(data);
    if (final) {
      if (size !== source.size || hash.digest("hex") !== source.hash)
        zipError = Error(`Portable archive contains a different ${file.name}`);
      else completed.add(file.name);
    }
  };
  file.start();
});
unzip.register(UnzipInflate);
for await (const chunk of createReadStream(
  "release/SimpleLexEditor-portable.zip",
)) {
  unzip.push(chunk);
  if (zipError) throw zipError;
}
unzip.push(new Uint8Array(), true);
if (zipError) throw zipError;
if (entries.size !== expected.length || completed.size !== expected.length)
  throw Error("Incomplete portable archive");
if (
  (await hashFile(
    `src-tauri/target/release/bundle/nsis/SimpleLexEditor_${pkg.version}_x64-setup.exe`,
  )) !== (await hashFile("release/SimpleLexEditor-Setup.exe"))
)
  throw Error("Download installer differs from the built installer");
const installerScript = await fs.readFile(
  "src-tauri/target/release/nsis/x64/installer.nsi",
  "utf8",
);
if (!installerScript.includes('"/oname=LICENSE"'))
  throw Error("Installer does not carry the project license");
const minimumWebview = tauri.bundle.windows?.minimumWebview2Version;
if (minimumWebview) {
  if (
    !installerScript.includes(
      `!define MINIMUMWEBVIEW2VERSION "${minimumWebview}"`,
    )
  )
    throw Error(
      "Installer template does not enforce the configured WebView2 minimum",
    );
  if (
    !installerScript.includes(
      '!define INSTALLWEBVIEW2MODE "offlineInstaller"',
    ) ||
    !installerScript.includes("tex-runtime.exe")
  )
    throw Error("Installer does not carry its offline dependencies");
}
const manifest = JSON.parse(
  (await fs.readFile("release/release-manifest.json", "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
if (
  manifest.version !== pkg.version ||
  manifest.binarySha256 !== createHash("sha256").update(built).digest("hex")
)
  throw Error("Release manifest does not describe this build");
if (
  manifest.channel === "production" &&
  (!manifest.nativeVerification ||
    manifest.binarySignature !== "Valid" ||
    manifest.installerSignature !== "Valid")
)
  throw Error("Production release lacks required verification or signing");
console.log(
  `PASS SimpleLexEditor ${pkg.version}: offline TeX/WebView2, versions, CSP, desktop permission scope, packaged executable and download checksums.`,
);
