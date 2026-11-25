import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "dist");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of await readdir(root)) {
  if ((name.endsWith(".html") && !name.startsWith("qa-")) || ["assets", "site.config.js"].includes(name)) await cp(path.join(root, name), path.join(destination, name), { recursive: true });
}
console.log("Built public files in dist/.");
