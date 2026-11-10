// 零依赖静态文件服务，仅监听本机。运行：npm start
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.txt':'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.') || part === 'node_modules')) throw new Error('禁止访问');
    const resolved = await realpath(target);
    if (path.relative(root, resolved).startsWith('..')) throw new Error('禁止访问');
    const data = await readFile(resolved);
    res.writeHead(200, {'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '8000 端口已被占用。请先打开 http://127.0.0.1:8000/ 检查，或关闭占用端口的服务后重试。' : error.message); process.exitCode = 1; });
server.listen(8000, '127.0.0.1', () => {
  console.log('一页阅读器：http://127.0.0.1:8000/\n保持本窗口运行，按 Ctrl+C 停止。');
  if (process.argv.includes('--open') && process.platform === 'win32') execFile('explorer.exe', ['http://127.0.0.1:8000/'], () => {});
});
