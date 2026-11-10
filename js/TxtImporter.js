import { Book } from './Book.js';

export class TxtImporter {
  async import(file, encoding = 'utf-8') {
    if (!/\.txt$/i.test(file.name)) throw new Error('请选择 .txt 格式的电子书。');
    if (file.size > 5 * 1024 * 1024) throw new Error('这本书超过 5 MiB，请选择较小的 TXT 文件。');
    if (!['utf-8', 'gb18030'].includes(encoding)) throw new Error('请选择受支持的编码。');
    let buffer;
    try { buffer = await file.arrayBuffer(); }
    catch { throw new Error('文件读取失败，请重新选择文件。'); }
    let text;
    try { text = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
    catch { throw new Error(`无法按 ${encoding.toUpperCase()} 读取，请切换编码后重新导入原文件。`); }
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.trim()) throw new Error('这个文件没有可阅读的文字，请选择其他 TXT。');
    return new Book({ title: file.name.replace(/\.txt$/i, ''), paragraphs: text.split('\n'), encoding });
  }
}
