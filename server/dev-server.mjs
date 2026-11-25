import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";
const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
const portNumber = Number(option("--port") || process.env.PORT) || 3000;
const listenAddress = option("--host") || "127.0.0.1";
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm" };
const env = { ASSETS: { async fetch(request) {
  const url = new URL(request.url);
  let target;
  try { target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`); } catch { return new Response("Bad request", { status: 400 }); }
  if (target !== root && !target.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
  try { if ((await stat(target)).isDirectory()) target = path.join(target, "index.html"); return new Response(await readFile(target), { headers: { "Content-Type": mime[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" } }); }
  catch { return new Response("Not found. Run npm run build first.", { status: 404 }); }
} } };
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(new URL(incoming.url, `http://127.0.0.1:${portNumber}`), { method: incoming.method, headers: incoming.headers, ...(!["GET", "HEAD"].includes(incoming.method) ? { body: incoming, duplex: "half" } : {}) });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end("Local server error."); }
}).listen(portNumber, listenAddress, () => console.log(`Open http://127.0.0.1:${portNumber} — local preview. Use npm run dev:worker for private service credentials.`));
