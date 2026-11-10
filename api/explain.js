import { explainText } from '../deepseek.js';

// Both Vercel and the local HTTP server use this handler. No request data is logged.
export async function handleExplain(req, res, { local = false, fetchImpl = fetch } = {}) {
  const send = (status, payload) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(payload)); };
  try {
    const origin = req.headers.origin;
    const host = req.headers.host;
    const expected = local ? 'http://127.0.0.1:8000' : (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `https://${host}` : '');
    if (req.method !== 'POST' || !expected || origin !== expected || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(403,{error:'请求来源或格式不受支持。'});
    const length=Number(req.headers['content-length'] || 0);
    if (length > 262144) return send(413,{error:'请求内容过长。'});
    let data=req.body;
    if (data === undefined) {
      let size=0; const chunks=[];
      for await (const chunk of req) { size+=chunk.length; if(size>262144) return send(413,{error:'请求内容过长。'}); chunks.push(chunk); }
      try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return send(400,{error:'请求格式有误。'});}
    }
    if (typeof data==='string') {try {data=JSON.parse(data);} catch {return send(400,{error:'请求格式有误。'});}}
    if (!data || typeof data!=='object' || Array.isArray(data) || Buffer.byteLength(JSON.stringify(data))>262144) return send(400,{error:'请求正文无效或超出长度限制。'});
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000 || Object.keys(data).some(k=>!['text','context','title','history','allowSpoilers'].includes(k))) return send(400,{error:'请求正文无效或超出长度限制。'});
    if (data.context && (typeof data.context !== 'object' || JSON.stringify(data.context).length > 50000)) return send(400,{error:'上下文过长。'});
    if ((data.title!==undefined && (typeof data.title!=='string'||data.title.length>500)) || (data.allowSpoilers!==undefined && typeof data.allowSpoilers!=='boolean') || (data.history!==undefined && (!Array.isArray(data.history)||data.history.length>12||data.history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>4000||Object.keys(m).some(k=>!['role','content'].includes(k)))))) return send(400,{error:'书名或对话内容无效。'});
    const key=req.headers['x-deepseek-key'];
    if (typeof key!=='string' || !/^[\x21-\x7e]{1,256}$/.test(key)) return send(400,{error:'请在 AI 助手中输入有效的 API Key。'});
    const result=await explainText(data.text,key,fetchImpl,data.context,data.title,data.history,data.allowSpoilers);
    return send(result.status,result.answer ? {answer:result.answer} : {error:result.error});
  } catch { return send(500,{error:'请求处理失败，请稍后重试。'}); }
}
export default function handler(req,res) { return handleExplain(req,res); }
