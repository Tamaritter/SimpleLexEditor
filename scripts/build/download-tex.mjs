import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline, finished } from "node:stream/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const lock = JSON.parse(
  await fs.readFile(path.join(root, "scripts/build/tex-runtime.lock.json")),
);
const directory = path.join(root, ".tools/tex-download");
await fs.mkdir(directory, { recursive: true });
const target = path.join(directory, "TinyTeX-2-windows.exe");
const hashFile = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
if (
  (await fs.stat(target).catch(() => null))?.size === lock.size &&
  (await hashFile(target)) === lock.sha256
) {
  console.log("PASS cached TeX archive");
  process.exit(0);
}
// Bounded parallel range requests keep the large, pinned offline payload
// practical to fetch. Only an exact SHA-256 match is published as the archive.
const count = 16;
const size = Math.ceil(lock.size / count);
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < count) {
      const index = next++;
      const start = index * size;
      const end = Math.min(lock.size, start + size) - 1;
      const file = path.join(directory, `${lock.sha256}-${index}.part`);
      let received = (await fs.stat(file).catch(() => null))?.size || 0;
      if (received > end - start + 1) throw Error("Oversized cached TeX range");
      let failures = 0;
      while (received < end - start + 1) {
        const offset = start + received;
        const stop = Math.min(end, offset + 4 * 1024 * 1024 - 1);
        try {
          const response = await fetch(lock.url, {
            headers: { Range: `bytes=${offset}-${stop}` },
            signal: AbortSignal.timeout(90000),
          });
          if (
            response.status !== 206 ||
            response.headers.get("content-range") !==
              `bytes ${offset}-${stop}/${lock.size}`
          )
            throw Error("TeX download did not return the requested byte range");
          await pipeline(
            Readable.fromWeb(response.body),
            createWriteStream(file, { flags: "a" }),
          );
          failures = 0;
        } catch (error) {
          if (++failures >= 5) throw error;
        }
        received = (await fs.stat(file).catch(() => null))?.size || 0;
      }
      console.log(`TeX download: part ${index + 1}/${count} ready`);
    }
  }),
);
const temporary = `${target}.verified`;
const output = createWriteStream(temporary);
output.setMaxListeners(0);
for (let index = 0; index < count; index++)
  await pipeline(
    createReadStream(path.join(directory, `${lock.sha256}-${index}.part`)),
    output,
    { end: false },
  );
output.end();
await finished(output);
if ((await hashFile(temporary)) !== lock.sha256)
  throw Error(
    "TeX SHA-256 mismatch; update the lock deliberately if the upstream daily build changed",
  );
await fs.rename(temporary, target);
console.log("PASS full offline TeX archive verified");
