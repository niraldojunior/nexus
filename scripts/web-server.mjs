import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('..', import.meta.url)), 'web');
const basePort = 5200;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  pathname = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(rootDir, pathname);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) throw new Error('dir');
    res.statusCode = 200;
    res.setHeader('content-type', mimeTypes[extname(filePath)] || 'application/octet-stream');
    createReadStream(filePath).pipe(res);
  } catch {
    const fallback = join(rootDir, 'index.html');
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    createReadStream(fallback).pipe(res);
  }
});

const start = (port) => {
  server.once('error', (error) => {
    if (error && typeof error === 'object' && error.code === 'EADDRINUSE') {
      server.removeAllListeners('error');
      start(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`Nexus web server running at http://localhost:${port}`);
  });
};

start(basePort);
