// Minimal static server. Suites that need a real origin (BroadcastChannel, two
// pages talking to each other) can't use file:// — every file:// page is its own
// opaque origin, so a channel between them silently never delivers.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.css':'text/css' };

export async function serve(root = process.cwd()){
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream',
                           'cache-control': 'no-store' });
      res.end(body);
    } catch (_) { res.writeHead(404, {'content-type':'text/plain'}); res.end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) };
}
