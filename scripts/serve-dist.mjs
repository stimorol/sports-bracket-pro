import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url || '/', `http://localhost:${port}`);
  let relPath = decodeURIComponent(urlObj.pathname);
  if (relPath === '/') relPath = '/index.html';

  const safePath = path.normalize(path.join(distDir, relPath));
  if (!safePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    res.end(content);
  });
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\n🏆 TournamentPro 本地預覽伺服器已啟動：${url}`);
  console.log('   按 Ctrl + C 可隨時停止伺服器。\n');
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    exec(`start "" "${url}"`);
  }
});
