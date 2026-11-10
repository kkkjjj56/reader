import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TxtImporter } from '../js/TxtImporter.js';
import { Book } from '../js/Book.js';

test('导入中文、BOM、换行和纯文本标签', async () => {
  const file = new File(['\ufeff第一章\r\n\r\n<script>文字</script>'], '测试.txt');
  const book = await new TxtImporter().import(file);
  assert.equal(book.title, '测试');
  assert.deepEqual(book.paragraphs, ['第一章', '', '<script>文字</script>']);
});
test('GB18030 中文与错误 UTF-8 编码', async () => {
  const file = new File([new Uint8Array([0xd6, 0xd0, 0xce, 0xc4])], '中文.txt');
  assert.equal((await new TxtImporter().import(file, 'gb18030')).paragraphs[0], '中文');
  await assert.rejects(new TxtImporter().import(file), /切换编码/);
});
test('拒绝错误类型、空文件和超限文件', async () => {
  const importer = new TxtImporter();
  await assert.rejects(importer.import(new File(['正文'], 'a.pdf')), /txt/);
  await assert.rejects(importer.import(new File([' \n '], 'a.txt')), /没有可阅读/);
  await assert.rejects(importer.import(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.txt')), /超过/);
});
test('位置边界与对象独立性', () => {
  const a = new Book({ title: 'A', paragraphs: ['一', '二'] });
  const b = new Book({ title: 'B', paragraphs: ['三'] });
  a.updatePosition({ index: 900, ratio: -1 }, 150);
  assert.deepEqual(a.position, { index: 1, ratio: 0 });
  assert.equal(a.progress, 100);
  assert.deepEqual(b.position, { index: 0, ratio: 0 });
  assert.notEqual(a.id, b.id);
});
