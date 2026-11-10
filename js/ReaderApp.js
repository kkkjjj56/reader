import { TxtImporter } from './TxtImporter.js';
import { ReaderView } from './ReaderView.js';
import { LibraryStore } from './LibraryStore.js';
import { ReaderSettings } from './ReaderSettings.js';

export class ReaderApp {
  constructor() {
    this.importer = new TxtImporter();
    this.view = new ReaderView();
    this.store = new LibraryStore();
    this.settings = new ReaderSettings();
    this.books = [];
    this.unsaved = new Set();
    this.current = null;
    this.saving = Promise.resolve();
    this.restoring = false;
    this.working = false;
  }
  async start() {
    this.view.applySettings(this.settings);
    this.bindEvents();
    this.working = true;
    this.view.busy(true);
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
    } finally {
      this.working = false;
      this.view.busy(false);
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
      for (const book of this.books.filter(item => item !== this.current)) {
        await this.store.save(book);
        this.unsaved.delete(book.id);
      }
      await this.persist();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    for (const [id, delta] of [['font-down', -2], ['font-up', 2]]) {
      document.getElementById(id).onclick = () => this.run(() => this.changeLayout(() => this.settings.resize(delta)));
    }
    document.getElementById('theme-toggle').onclick = () => this.run(() => this.changeLayout(() => this.settings.toggleTheme()));
    const shelfToggle = document.getElementById('shelf-toggle');
    const toggleShelf = () => {
      document.body.classList.toggle('shelf-hidden');
      shelfToggle.setAttribute('aria-expanded', String(!document.body.classList.contains('shelf-hidden')));
    };
    if (window.innerWidth <= 700) toggleShelf();
    shelfToggle.onclick = () => this.run(() => this.changeLayout(toggleShelf, false));
    let resizeTimer;
    const restoreAfterResize = () => {
      if (this.working) { resizeTimer = setTimeout(restoreAfterResize, 50); return; }
      this.run(() => this.changeLayout(() => {}, false));
    };
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      this.restoring = true;
      resizeTimer = setTimeout(restoreAfterResize, 150);
    });
  }
  async changeLayout(change, saveSettings = true) {
    // 使用上次记录的段落定位，避免窗口重排后的像素位置覆盖原位置。
    const position = this.current ? { ...this.current.position } : null;
    this.restoring = true;
    change();
    this.view.applySettings(this.settings);
    this.view.busy(true);
    let settingsError = false;
    if (saveSettings) {
      try { this.settings.save(); }
      catch { settingsError = true; }
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (position) this.view.restorePosition(position);
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.restoring = false;
    if (this.current) { this.capture(); await this.flush(); }
    if (saveSettings) {
      if (settingsError) this.view.message('设置已应用，但无法保存；请检查浏览器存储权限。', true);
      else if (document.getElementById('retry-save').hidden) this.view.message('阅读设置已保存');
    }
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
        this.unsaved.delete(book.id);
        const pending = this.pendingDelete || this.unsaved.size > 0;
        this.view.message(pending ? '当前进度已保存，仍有操作未保存，请重试。' : '已保存 · 阅读进度保存在此浏览器', Boolean(pending));
        document.getElementById('retry-save').hidden = !pending;
        this.renderShelf();
      } catch {
        this.unsaved.add(book.id);
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
    this.unsaved.delete(id);
    if (this.current?.id === id) { this.current = null; this.view.showBook(null); }
    this.pendingDelete = null;
    document.getElementById('retry-save').hidden = true;
    this.renderShelf();
    this.view.message('书籍已从书架删除');
  }
}
