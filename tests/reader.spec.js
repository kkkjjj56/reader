import { test, expect } from '@playwright/test';
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
