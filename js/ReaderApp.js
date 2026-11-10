import { TxtImporter } from './TxtImporter.js';
import { ReaderView } from './ReaderView.js';
import { LibraryStore } from './LibraryStore.js';

export class ReaderApp {
  constructor() {
    this.importer = new TxtImporter();
    this.view = new ReaderView();
    this.store = new LibraryStore();
    this.books = [];
    this.current = null;
    this.saving = Promise.resolve();
    this.restoring = false;
    this.working = false;
  }
  async start() {
    this.bindEvents();
    this.view.message('正在打开书架…');
    try {
      await this.store.open();
      const { books, lastId } = await this.store.load();
      this.books = books;
      this.renderShelf();
      const book = books.find(item => item.id === lastId);
      if (book) await this.openBook(book);
      else this.view.message('书架已就绪，选择或导入一本书');
    } catch {
      this.view.message('书架暂时无法读取，仍可导入阅读；保存失败时请重试或刷新。', true);
    }
  }
  bindEvents() {
    const input = document.getElementById('file-input');
    for (const id of ['import-button', 'welcome-import']) document.getElementById(id).onclick = () => input.click();
    input.onchange = () => this.run(async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        this.view.message('正在读取书籍…');
        const book = await this.importer.import(file, document.getElementById('encoding').value);
        await this.flush();
        this.books.push(book);
        await this.openBook(book);
      } finally { input.value = ''; }
    });
    this.view.library.onclick = event => {
      const open = event.target.closest('[data-open]');
      const remove = event.target.closest('[data-remove]');
      if (open) this.run(async () => { await this.flush(); await this.openBook(this.books.find(book => book.id === open.dataset.open)); });
      if (remove) this.run(() => this.deleteBook(remove.dataset.remove));
    };
    this.view.reader.addEventListener('scroll', () => {
      if (!this.current || this.restoring) return;
      this.capture();
      this.view.message('阅读位置待保存…');
      if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.persist(); }, 500);
    });
    document.getElementById('retry-save').onclick = () => this.run(async () => {
      if (!this.store.db) await this.store.open();
      if (this.pendingDelete) await this.finishDelete(...this.pendingDelete);
      for (const book of this.books.filter(item => item !== this.current)) await this.store.save(book);
      await this.persist();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  }
  async run(action) {
    if (this.working) return;
    this.working = true;
    this.view.busy(true);
    try { await action(); }
    catch (error) { this.view.message(error.message || '操作失败，请重试。', true); }
    finally { this.working = false; this.view.busy(false); }
  }
  renderShelf() { this.view.renderLibrary(this.books, this.current?.id); this.view.busy(this.working); }
  capture() {
    if (!this.current) return;
    const { position, progress } = this.view.capturePosition();
    this.current.updatePosition(position, progress);
    this.view.updateProgress(progress);
  }
  async openBook(book) {
    if (!book) return;
    this.restoring = true;
    this.current = book;
    book.lastReadAt = Date.now();
    this.view.showBook(book);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    this.view.restorePosition(book.position);
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.restoring = false;
    this.capture();
    this.renderShelf();
    await this.persist();
  }
  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.restoring) this.capture();
    return this.persist();
  }
  persist() {
    if (!this.current) return this.saving;
    const book = structuredClone(this.current);
    // 按顺序保存快照，避免快速切书时旧写入覆盖新位置。
    this.saving = this.saving.then(async () => {
      try {
        await this.store.save(book);
        this.view.message('已保存 · 阅读进度保存在此浏览器');
        document.getElementById('retry-save').hidden = !this.pendingDelete;
        this.renderShelf();
      } catch {
        this.view.message('未保存：浏览器存储不可用或空间不足。可重试保存。', true);
        document.getElementById('retry-save').hidden = false;
      }
    });
    return this.saving;
  }
  async deleteBook(id) {
    const book = this.books.find(item => item.id === id);
    if (!book || !confirm(`删除《${book.title}》？正文和阅读位置将从此浏览器移除，原 TXT 文件仍保留。`)) return;
    await this.flush();
    const currentId = this.current?.id === id ? null : this.current?.id;
    this.pendingDelete = [id, currentId];
    try { await this.finishDelete(id, currentId); }
    catch { this.view.message('删除失败，书籍仍保留，请重试保存或稍后再试。', true); document.getElementById('retry-save').hidden = false; }
  }
  async finishDelete(id, currentId) {
    await this.store.remove(id, currentId);
    this.books = this.books.filter(item => item.id !== id);
    if (this.current?.id === id) { this.current = null; this.view.showBook(null); }
    this.pendingDelete = null;
    document.getElementById('retry-save').hidden = true;
    this.renderShelf();
    this.view.message('书籍已从书架删除');
  }
}
