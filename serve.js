#!/usr/bin/env node
/**
 * Simple local development server for PDFSlick.
 * No dependencies — uses Node.js built-in http and fs modules.
 *
 * Usage:
 *   node serve.js          # default port 8080
 *   node serve.js 3000     # custom port
 *
 * Or install http-server globally and run:
 *   npx http-server . -p 8080 --cors
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = parseInt(process.argv[2], 10) || 8080;
const ROOT    = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.xml':  'application/xml',
  '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // Strip query string
  let urlPath = req.url.split('?')[0];

  // Resolve to filesystem path
  let filePath = path.join(ROOT, urlPath);

  // Directory → try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // 404 if file doesn't exist
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${urlPath}`);
    console.log(`  404  ${urlPath}`);
    return;
  }

  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
    console.log(`  200  ${urlPath}`);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
    console.error(`  500  ${urlPath}`, err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  PDFSlick dev server running at:`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
