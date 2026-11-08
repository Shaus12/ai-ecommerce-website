/**
 * Static server for the SO.KI storefront (src/store) during development.
 * Usage: node scripts/serve-store.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/store');
const port = Number(process.argv[2] ?? 4321);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; } // no directory traversal
  if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(port, () => console.log(`SO.KI store on http://localhost:${port}`));
