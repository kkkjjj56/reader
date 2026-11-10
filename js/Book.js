// 一个 Book 对象代表一本书；各对象拥有独立的阅读位置。
export class Book {
  constructor({ id = crypto.randomUUID(), title, paragraphs, encoding = 'utf-8', importedAt = Date.now(), lastReadAt = 0, position = {}, progress = 0 }) {
    Object.assign(this, { id, title, paragraphs, encoding, importedAt, lastReadAt });
    this.updatePosition(position, progress);
  }
  updatePosition(position = {}, progress = 0) {
    this.position = {
      index: Math.max(0, Math.min(this.paragraphs.length - 1, Math.floor(Number(position.index) || 0))),
      ratio: Math.max(0, Math.min(1, Number(position.ratio) || 0)),
    };
    this.progress = Math.max(0, Math.min(100, Number(progress) || 0));
  }
}
