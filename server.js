// 零依赖静态文件服务，仅监听本机。运行：npm start
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { explainText } from './deepseek.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.txt':'text/plain; charset=utf-8' };
export const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/explain') {
      const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(payload)); };
      if (req.method !== 'POST' || req.headers.host !== '127.0.0.1:8000' || req.headers.origin !== 'http://127.0.0.1:8000' || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(403, { error: '请求来源或格式不受支持。' });
      let chunks = [], size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 262144) return send(413, { error: '请求内容过长。' });
        chunks.push(chunk);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: '请求格式有误。' }); }
      if (!data || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000 || Object.keys(data).some(key => !['text','context','title','history','allowSpoilers'].includes(key))) return send(400, { error: '请求正文无效或超出长度限制。' });
      if (data.context && (typeof data.context !== 'object' || JSON.stringify(data.context).length > 50000)) return send(400, { error: '上下文过长。' });
      if ((data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 500)) || (data.allowSpoilers !== undefined && typeof data.allowSpoilers !== 'boolean') || (data.history !== undefined && (!Array.isArray(data.history) || data.history.length > 12 || data.history.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 4000 || Object.keys(m).some(k => !['role','content'].includes(k)))))) return send(400, {error:'书名或对话内容无效。'});
      const result = await explainText(data.text, process.env.DEEPSEEK_API_KEY, fetch, data.context, data.title, data.history, data.allowSpoilers);
      return send(result.status, result.answer ? { answer: result.answer } : { error: result.error });
    }
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(8000, '127.0.0.1', () => {
    console.log('一页阅读器：http://127.0.0.1:8000/\n保持本窗口运行，按 Ctrl+C 停止。');
    if (process.argv.includes('--open') && process.platform === 'win32') execFile('explorer.exe', ['http://127.0.0.1:8000/'], () => {});
  });
}
