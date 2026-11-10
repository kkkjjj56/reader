import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainText } from '../deepseek.js';
import { server } from '../server.js';
import http from 'node:http';
import { buildContext } from '../js/BookAnalysis.js';

test('缺少密钥时不发出请求', async () => {
  const result = await explainText('选文', '', () => { throw new Error('不应调用'); });
  assert.equal(result.status, 503);
  assert.match(result.error, /未配置/);
});
test('默认排除后文，允许剧透时可使用后文', () => {
  const text = '甲说他来了。秘密在后面揭晓。';
  const selection = {start:2, end:6, text:text.slice(2, 6)};
  const safe = buildContext(text, selection, null, false);
  assert.equal(safe.excerpts[0].text, text.slice(0, 6));
  assert.equal(safe.summaries, undefined);
  const spoilers = buildContext(text, selection, null, true);
  assert.match(spoilers.excerpts[0].text, /秘密在后面/);
});
test('请求只包含选文和系统指令，响应返回正文', async () => {
  const result = await explainText('仅此选文', 'test-key', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'deepseek-flash');
    assert.deepEqual(body.messages.map(item => item.role), ['system', 'user']);
    assert.equal(body.messages[1].content, '仅此选文');
    assert.match(body.messages[0].content, /不要剧透/);
    return {ok:true, json:async () => ({choices:[{message:{content:'解释'}}]})};
  });
  assert.deepEqual(result, {status:200, answer:'解释'});
});
test('错误原因安全映射，不暴露上游响应或密钥', async () => {
  for (const [status, phrase] of [[401, '验证失败'], [402, '余额不足'], [429, '频繁'], [503, '繁忙']]) {
    const result = await explainText('选文', 'test-key', async () => ({ok:false,status}));
    assert.match(result.error, new RegExp(phrase));
    assert.doesNotMatch(result.error, /test-key/);
  }
  const failed = await explainText('选文', 'test-key', async () => { throw new Error('sensitive'); });
  assert.match(failed.error, /无法连接/);
  assert.doesNotMatch(failed.error, /sensitive/);
});
test('本机接口校验来源、内容和缺失密钥', async () => {
  const oldKey = process.env.DEEPSEEK_API_KEY;
  const oldFetch = globalThis.fetch;
  delete process.env.DEEPSEEK_API_KEY;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/explain`;
    const headers = {'Content-Type':'application/json', Host:'127.0.0.1:8000', Origin:'http://127.0.0.1:8000'};
    const send = (body, overrides = {}) => new Promise((resolve, reject) => {
      const request = http.request(url, {method:'POST', headers:{...headers,...overrides}}, response => {
        let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({status:response.statusCode, json:async () => JSON.parse(text)}));
      });
      request.on('error', reject); request.end(JSON.stringify(body));
    });
    const missing = await send({text:'一段选文'});
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /未配置/);
    assert.equal((await send({text:'一段选文'}, {Origin:'http://evil.example'})).status, 403);
    let receivedKey;
    globalThis.fetch = async (_url, options) => { receivedKey = options.headers.Authorization; return {ok:true, json:async () => ({choices:[{message:{content:'解释'}}]})}; };
    const userResponse = await send({text:'一段选文'}, {'X-DeepSeek-Key':'test-user-key'});
    assert.equal(userResponse.status, 200);
    assert.equal(receivedKey, 'Bearer test-user-key');
    assert.doesNotMatch(JSON.stringify(await userResponse.json()), /test-user-key/);
    assert.equal((await send({text:'一段选文', extra:'全文'})).status, 400);
    assert.equal((await send({text:'文'.repeat(2001)})).status, 400);
  } finally {
    globalThis.fetch = oldFetch;
    await new Promise(resolve => server.close(resolve));
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
  }
});
