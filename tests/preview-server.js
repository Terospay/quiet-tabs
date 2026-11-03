import http from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const paths = new Set(['/panel.html', '/panel.css', '/panel.js', '/core.js', '/i18n.js', '/engine.js', '/tests/demo.js', '/tests/fake-chrome.js']);
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!paths.has(path)) { response.writeHead(404); response.end(); return; }
  try {
    let body = await readFile(new URL(path.slice(1), root), 'utf8');
    if (path === '/panel.html') body = body.replace('src="panel.js"', 'src="tests/demo.js"');
    response.writeHead(200, { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'text/javascript' });
    response.end(body);
  } catch { response.writeHead(500); response.end('Preview failed'); }
});
server.listen(43127, '127.0.0.1', () => process.stdout.write('Preview: http://127.0.0.1:43127/panel.html\n'));
