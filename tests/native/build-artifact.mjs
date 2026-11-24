import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
export function buildArtifact(
  root,
  main,
  extension = "pdf",
  engine = "pdflatex",
) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(main))
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  const parent = path.join(
    root,
    ".roxena/build",
    `${engine}-${hash.toString(16).padStart(16, "0")}`,
  );
  const stem = path.basename(main, path.extname(main));
  const jobs = readdirSync(parent)
    .map((name) => path.join(parent, name))
    .filter((file) => statSync(file).isDirectory())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const found = jobs
    .map((job) => path.join(job, `${stem}.${extension}`))
    .find(existsSync);
  if (!found) throw Error(`Build artifact not found: ${main} (${extension})`);
  return found;
}
