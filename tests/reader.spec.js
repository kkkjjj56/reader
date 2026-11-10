import { test, expect } from '@playwright/test';
test('书名、前后文与连续追问', async ({page}) => {
  const requests = [];
  await page.route('**/api/explain', route => { requests.push(route.request().postDataJSON()); return route.fulfill({json:{answer:'可能指乙，依据是前文甲遇见乙。'}}); });
  await page.goto('/');
  await upload(page, '第一本.txt', '甲遇见乙。\n甲说他来了。\n后来乙揭晓秘密。');
  const select = () => page.locator('#content p').nth(1).evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); });
  await select();
  await page.getByRole('button', {name:'✦ AI 解释'}).click();
  await expect(page.locator('#ai-answer')).toContainText('可能指乙');
  expect(requests[0].title).toBe('第一本');
  expect(requests[0].context.excerpts[0].text).toContain('甲遇见乙');
  expect(JSON.stringify(requests[0])).not.toContain('后来乙揭晓秘密');
  await page.locator('#ai-question').fill('他是谁？');
  await page.getByRole('button', {name:'发送', exact:true}).click();
  await expect(page.locator('#ai-chat')).toContainText('他是谁？');
  expect(requests[1].history.at(-1)).toEqual({role:'user', content:'他是谁？'});
  await page.locator('#ai-spoilers').check();
  await expect(page.locator('#ai-chat')).toBeEmpty();
  await select();
  await page.getByRole('button', {name:'✦ AI 解释'}).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(JSON.stringify(requests[2].context)).toContain('后来乙揭晓秘密');
  await page.reload();
  await expect(page.locator('#ai-chat')).toBeEmpty();
});
test('选文解释、失败重试、边界和会话清理', async ({page}) => {
  const requests = [];
  await page.route('**/api/explain', async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await route.fulfill({status: 502, json: {error:'测试网络失败'}});
    else await route.fulfill({json: {answer:'依据选文，这句话描写了窗外。'}});
  });
  await page.goto('/');
  await upload(page, '小说.txt');
  await page.getByRole('button', {name:'✦ AI 解释'}).click();
  await expect(page.locator('#ai-answer')).toContainText('请先在正文');
  await page.getByRole('button', {name:'关闭 AI 面板'}).click();
  await page.locator('#reader').evaluate(el => el.scrollTop = 1800);
  await page.waitForTimeout(700);
  const position = () => page.evaluate(async () => { const {ReaderView} = await import('/js/ReaderView.js'); return new ReaderView().capturePosition().position.index; });
  const before = await position();
  await page.locator('#content p').nth(20).evaluate(el => {
    const range = document.createRange(); range.setStart(el.firstChild, 0); range.setEnd(el.firstChild, 8);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole('button', {name:'✦ AI 解释'}).click();
  await expect(page.locator('#ai-selection')).toHaveText('第11段：窗外的');
  await expect(page.locator('#ai-answer')).toContainText('测试网络失败');
  await page.getByRole('button', {name:'重试', exact:true}).click();
  await expect(page.locator('#ai-answer')).toContainText('依据选文');
  expect(requests.map(item => item.text)).toEqual(['第11段：窗外的', '第11段：窗外的']);
  await expect.poll(async () => Math.abs(await position() - before)).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(page.locator('#ai-panel')).toBeHidden();
  await expect(page.locator('#ai-selection')).toBeEmpty();
  await page.locator('#content').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  await page.getByRole('button', {name:'✦ AI 解释'}).click();
  await expect(page.locator('#ai-answer')).toContainText('超过 2000');
  await upload(page, '第二本.txt');
  await expect(page.locator('#ai-panel')).toBeHidden();
  await expect(page.locator('#ai-selection')).toBeEmpty();
});
const text = Array.from({length: 150}, (_, i) => `第${i + 1}段：窗外的风翻过书页。我们沿着河流散步，把今天的故事写在纸上。中文阅读测试，English 123。`).join('\n\n');
const upload = async (page, name, content = text) => {
  await page.locator('#file-input').setInputFiles({name, mimeType:'text/plain', buffer:Buffer.from(content)});
  await expect(page.locator('#book-title')).toHaveText(name.replace(/\.txt$/, ''));
  await expect(page.locator('#status')).toContainText('已保存');
};
test('多书独立位置、刷新、删除与纯文本', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.getByRole('group', {name:'阅读设置'})).toBeHidden();
  await upload(page, '河边散记.txt');
  await expect(page.locator('#reader').getByRole('group', {name:'阅读设置'})).toBeVisible();
  await page.locator('#reader').evaluate(el => el.scrollTop = 2500);
  await page.waitForTimeout(800);
  const toolbarTop = await page.locator('#reading-controls').evaluate(el => el.getBoundingClientRect().top);
  const readerTop = await page.locator('#reader').evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(toolbarTop - readerTop)).toBeLessThan(2);
  const original = await page.locator('#reader').evaluate(el => el.scrollTop);
  await upload(page, '另一段旅程.txt', text + '\n<script>window.injected=true</script>');
  await page.locator('#reader').evaluate(el => el.scrollTop = 700);
  await page.waitForTimeout(800);
  await page.getByRole('button', {name:'河边散记', exact:true}).click();
  await expect.poll(() => page.locator('#reader').evaluate(el => el.scrollTop)).toBeCloseTo(original, -1);
  await page.reload();
  await expect(page.locator('#book-title')).toHaveText('河边散记');
  await expect.poll(() => page.locator('#reader').evaluate(el => el.scrollTop)).toBeCloseTo(original, -1);
  await page.getByRole('button', {name:'另一段旅程', exact:true}).click();
  await expect(page.locator('#content')).toContainText('<script>window.injected=true</script>');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', {name:'删除《另一段旅程》', exact:true}).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'删除《另一段旅程》', exact:true}).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.getByRole('group', {name:'阅读设置'})).toBeHidden();
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});
test('字号主题、段落保持、键盘和窄窗口', async ({page}, testInfo) => {
  await page.goto('/');
  await upload(page, '河边散记.txt');
  await page.locator('#reader').evaluate(el => el.scrollTop = 1800);
  await page.waitForTimeout(700);
  const position = () => page.evaluate(async () => {
    const { ReaderView } = await import('/js/ReaderView.js');
    return new ReaderView().capturePosition().position.index;
  });
  const before = await position();
  await page.getByRole('button', {name:'增大字号'}).click();
  await expect(page.locator('#font-size')).toHaveText('22');
  await expect.poll(position).toBe(before);
  await page.getByRole('button', {name:'切换深色主题'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('#font-size')).toHaveText('22');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#status')).toContainText('已保存');
  await page.screenshot({path:`test-results/${testInfo.project.name}-dark.png`});
  for (let i = 0; i < 5; i++) await page.getByRole('button', {name:'增大字号'}).click();
  await expect(page.getByRole('button', {name:'增大字号'})).toBeDisabled();
  for (let i = 0; i < 9; i++) await page.getByRole('button', {name:'减小字号'}).click();
  await expect(page.getByRole('button', {name:'减小字号'})).toBeDisabled();
  await page.setViewportSize({width:1000,height:800});
  await page.waitForTimeout(400);
  // 多次重排允许一个空行的舍入误差，原文字段落仍在视口中。
  await expect.poll(async () => Math.abs(await position() - before)).toBeLessThanOrEqual(1);
  await page.getByRole('button', {name:'切换浅色主题'}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-theme','light');
  expect(await page.locator('#reader').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({path:`test-results/${testInfo.project.name}-light.png`});
  await page.setViewportSize({width:600,height:800});
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('GB18030、同名书、空文件及关闭标签页恢复', async ({page, context}) => {
  await page.goto('/');
  await page.locator('#encoding').selectOption('gb18030');
  await page.locator('#file-input').setInputFiles({name:'中文.txt',mimeType:'text/plain',buffer:Buffer.from([0xd6,0xd0,0xce,0xc4])});
  await expect(page.locator('#content')).toHaveText('中文');
  await expect(page.locator('#status')).toContainText('已保存');
  await page.locator('#encoding').selectOption('utf-8');
  await upload(page, '中文.txt');
  await expect(page.locator('.book-card')).toHaveCount(2);
  await page.locator('#file-input').setInputFiles({name:'空白.txt',mimeType:'text/plain',buffer:Buffer.from(' \n ')});
  await expect(page.locator('#status')).toContainText('没有可阅读');
  await expect(page.locator('#book-title')).toHaveText('中文');
  await page.locator('#reader').evaluate(el => el.scrollTop = 1200);
  await page.waitForTimeout(800);
  await page.close();
  const next = await context.newPage();
  await next.goto('/');
  await expect(next.locator('.book-card')).toHaveCount(2);
  await expect(next.locator('#book-title')).toHaveText('中文');
  await expect.poll(() => next.locator('#reader').evaluate(el => el.scrollTop)).toBeCloseTo(1200, -1);
});

test('存储失败保留正文、可重试，损坏设置回退', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('one-page-settings', '{bad'));
  await page.goto('/');
  await expect(page.locator('#font-size')).toHaveText('20');
  await page.evaluate(async () => {
    const {LibraryStore} = await import('/js/LibraryStore.js');
    window.originalSave = LibraryStore.prototype.save;
    LibraryStore.prototype.save = () => Promise.reject(new Error('test quota'));
  });
  await page.locator('#file-input').setInputFiles({name:'失败重试.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('#status')).toContainText('未保存');
  await expect(page.locator('#content')).toContainText('第1段');
  await page.evaluate(async () => {
    const {LibraryStore} = await import('/js/LibraryStore.js');
    LibraryStore.prototype.save = window.originalSave;
  });
  await page.getByRole('button',{name:'重试保存'}).click();
  await expect(page.locator('#status')).toContainText('已保存');
  await page.reload();
  await expect(page.locator('#book-title')).toHaveText('失败重试');
});

test('阅读进度从零开始，到底后为百分之百', async ({page}) => {
  await page.goto('/');
  await upload(page, '进度.txt');
  await expect(page.locator('#progress-label')).toHaveText('阅读进度 0%');
  await page.locator('#reader').evaluate(el => el.scrollTop = el.scrollHeight);
  await expect(page.locator('#progress-label')).toHaveText('阅读进度 100%');
  await expect(page.locator('#status')).toContainText('已保存');
  await page.reload();
  await expect(page.locator('#progress-label')).toHaveText('阅读进度 100%');
});

test('其他书未保存时删除当前书，仍可重试保存', async ({page}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const {LibraryStore} = await import('/js/LibraryStore.js');
    const original = LibraryStore.prototype.save;
    LibraryStore.prototype.save = function(book, ...args) {
      return book.title === '未保存' ? Promise.reject(new Error('测试存储失败')) : original.call(this, book, ...args);
    };
    window.restoreSave = () => { LibraryStore.prototype.save = original; };
  });
  await page.locator('#file-input').setInputFiles({name:'未保存.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('#status')).toContainText('未保存');
  await page.locator('#file-input').setInputFiles({name:'已保存.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('#book-title')).toHaveText('已保存');
  await expect(page.getByRole('button',{name:'重试保存'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'删除《已保存》'}).click();
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.getByRole('button',{name:'重试保存'})).toBeVisible();
  await page.evaluate(() => window.restoreSave());
  await page.getByRole('button',{name:'重试保存'}).click();
  await expect(page.locator('#status')).toContainText('已保存');
  await page.reload();
  await expect(page.getByRole('button',{name:'未保存', exact:true})).toBeVisible();
  await expect(page.locator('#welcome')).toBeVisible();
});

test('删除失败后换书，重试删除保留当前阅读的书', async ({page}) => {
  await page.goto('/');
  await upload(page, '第一本.txt');
  await upload(page, '第二本.txt');
  await page.evaluate(async () => {
    const {LibraryStore} = await import('/js/LibraryStore.js');
    const original = LibraryStore.prototype.remove;
    LibraryStore.prototype.remove = () => Promise.reject(new Error('测试删除失败'));
    window.restoreRemove = () => { LibraryStore.prototype.remove = original; };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'删除《第二本》'}).click();
  await expect(page.locator('#status')).toContainText('删除失败');
  await page.getByRole('button',{name:'第一本', exact:true}).click();
  await expect(page.locator('#book-title')).toHaveText('第一本');
  await page.evaluate(() => window.restoreRemove());
  await page.getByRole('button',{name:'重试保存'}).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#book-title')).toHaveText('第一本');
});

test('启动时书架读取失败，重试后合并已有书籍', async ({page}) => {
  await page.goto('/');
  await upload(page, '原有书籍.txt');
  await page.evaluate(() => sessionStorage.setItem('simulate-open-failure', 'yes'));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('simulate-open-failure') !== 'yes') return;
    sessionStorage.removeItem('simulate-open-failure');
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      indexedDB.open = originalOpen;
      const request = { error: new Error('测试数据库暂时不可用') };
      setTimeout(() => request.onerror?.(), 0);
      return request;
    };
  });
  await page.reload();
  await expect(page.locator('#status')).toContainText('无法读取');
  await page.locator('#file-input').setInputFiles({name:'新书.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('#status')).toContainText('未保存');
  await page.getByRole('button',{name:'重试保存'}).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
  await expect(page.locator('#status')).toContainText('已保存');
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(2);
  await expect(page.locator('#book-title')).toHaveText('新书');
});
