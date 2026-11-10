import { TxtImporter } from './TxtImporter.js';
import { ReaderView } from './ReaderView.js';
import { LibraryStore } from './LibraryStore.js';
import { ReaderSettings } from './ReaderSettings.js';
import { fullText, buildContext, selectionFromRange } from './BookAnalysis.js';

export class ReaderApp {
  constructor() {
    this.importer = new TxtImporter();
    this.view = new ReaderView();
    this.store = new LibraryStore();
    this.localStore = this.store;
    this.cloudMode = false;
    this.settings = new ReaderSettings();
    this.books = [];
    this.unsaved = new Set();
    this.current = null;
    this.saving = Promise.resolve();
    this.restoring = false;
    this.working = false;
    this.libraryLoaded = false;
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
      this.libraryLoaded = true;
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
    const explain = document.getElementById('ai-explain');
    const panel = document.getElementById('ai-panel');
    const config = document.getElementById('ai-config');
    const keyInput = document.getElementById('ai-api-key');
    const configError = document.getElementById('ai-config-error');
    let pendingAiAction = null;
    const withAiKey = action => {
      if (this.aiApiKey) return action();
      pendingAiAction = action;
      keyInput.value = '';
      configError.textContent = '';
      if (!config.open) config.showModal();
      keyInput.focus();
    };
    document.getElementById('ai-config-cancel').onclick = () => { pendingAiAction = null; keyInput.value = ''; config.close(); };
    config.addEventListener('cancel', () => { pendingAiAction = null; keyInput.value = ''; });
    document.getElementById('ai-config-form').onsubmit = event => {
      event.preventDefault();
      const key = keyInput.value.trim();
      if (!/^[\x21-\x7e]{1,256}$/.test(key)) { configError.textContent = '请输入有效的 API Key，请勿包含空格或换行。'; return; }
      this.aiApiKey = key;
      keyInput.value = '';
      config.close();
      const action = pendingAiAction;
      pendingAiAction = null;
      action?.();
    };
    document.getElementById('ai-change-key').onclick = () => { this.aiApiKey = null; withAiKey(() => {}); };
    this.aiSelected = null;
    const readSelection = () => {
      const selection = window.getSelection();
      if (!this.current || !selection || selection.isCollapsed || !this.view.content.contains(selection.anchorNode) || !this.view.content.contains(selection.focusNode)) return null;
      return selectionFromRange(selection.getRangeAt(0), this.view.content, this.current);
    };
    document.addEventListener('selectionchange', () => { const text = readSelection(); if (text) this.aiSelected = text; else if (!panel.contains(document.activeElement) && document.activeElement !== explain) this.aiSelected = null; });
    explain.addEventListener('pointerdown', () => { this.aiSelected = readSelection() || this.aiSelected; });
    explain.onclick = () => {
      const selected = readSelection() || this.aiSelected;
      const text = selected?.text || '';
      const execute = () => this.run(async () => {
      await this.changeLayout(() => { panel.hidden = false; }, false);
      const answer = document.getElementById('ai-answer');
      const selectionWrap = document.getElementById('ai-selection-wrap');
      this.aiController?.abort();
      this.aiController = null;
      this.aiCurrentSelection = null;
      this.resetConversation();
      document.getElementById('ai-retry').hidden = true;
      selectionWrap.hidden = !text || text.length > 2000;
      if (!text) answer.textContent = '请先在正文中选中一段文字，再点击“AI 解释”。';
      else if (text.length > 2000) answer.textContent = '选中文字超过 2000 字符，请缩短后重试。';
      else {
        document.getElementById('ai-selection').textContent = text;
        this.aiCurrentSelection = selected;
        this.requestExplanation(text);
      }
      this.aiSelected = null;
      });
      if (text && text.length <= 2000) withAiKey(execute); else execute();
    };
    document.getElementById('ai-open').onclick = () => withAiKey(() => this.run(() => this.changeLayout(() => { panel.hidden = false; }, false)));
    document.getElementById('ai-retry').onclick = () => this.requestExplanation(document.getElementById('ai-selection').textContent, this.aiPendingQuestion || '');
    document.getElementById('ai-chat-form').onsubmit = event => {
      event.preventDefault();
      const field = document.getElementById('ai-question');
      const question = field.value.trim();
      if (!question || !this.aiCurrentSelection || this.aiController) return;
      field.value = ''; this.requestExplanation(this.aiCurrentSelection.text, question);
    };
    document.getElementById('ai-spoilers').onchange = () => {
      this.aiController?.abort(); this.aiController = null; this.resetConversation();
      document.getElementById('ai-answer').textContent = '范围已改变，请重新选中文字并点击“AI 解释”。';
      this.aiCurrentSelection = null;
      document.getElementById('ai-retry').hidden = true;
    };
    document.getElementById('ai-close').onclick = () => this.run(() => this.changeLayout(() => { panel.hidden = true; }, false));
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
      if (!this.cloudMode && !this.store.db) await this.store.open();
      if (!this.libraryLoaded) {
        const { books } = await this.store.load();
        const currentIds = new Set(this.books.map(book => book.id));
        this.books.unshift(...books.filter(book => !currentIds.has(book.id)));
        this.libraryLoaded = true;
        this.renderShelf();
      }
      if (this.pendingDelete) await this.finishDelete(this.pendingDelete);
      for (const book of this.books.filter(item => item !== this.current && this.unsaved.has(item.id))) {
        await this.store.save(book, false);
        this.unsaved.delete(book.id);
      }
      if (this.current) await this.persist();
      else this.reportSaveState();
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
    this.clearAi();
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
        if (!this.libraryLoaded) throw new Error('书架尚未读取');
        await this.store.save(book);
        this.unsaved.delete(book.id);
        this.reportSaveState();
        this.renderShelf();
      } catch (error) {
        this.unsaved.add(book.id);
        if (this.cloudMode && this.store.conflict?.id === book.id && this.current?.id === book.id) this.showCloudConflict();
        this.view.message(this.cloudMode ? (error.message || '云端同步失败，请重试。') : '未保存：浏览器存储不可用或空间不足。可重试保存。', true);
        document.getElementById('retry-save').hidden = false;
      }
    });
    return this.saving;
  }
  reportSaveState() {
    const failed = Boolean(this.pendingDelete) || this.unsaved.size > 0;
    const waiting = Boolean(this.timer);
    this.view.message(failed ? '仍有操作未保存，请重试。' : waiting ? '阅读位置待保存…' : this.cloudMode ? '已同步 · 阅读进度已保存到云端' : '已保存 · 阅读进度保存在此浏览器', failed);
    document.getElementById('retry-save').hidden = !failed;
  }
  showCloudConflict() {
    const conflict = this.store.conflict;
    if (!conflict || !this.current || conflict.id !== this.current.id || this.conflictDialog) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'cloud-dialog';
    const title = document.createElement('h2'); title.textContent = '阅读进度有冲突';
    const message = document.createElement('p'); message.textContent = `云端进度 ${Math.round(conflict.progress)}%，本机进度 ${Math.round(this.current.progress)}%。请选择要保留的位置。`;
    const local = document.createElement('button'); local.textContent = '保留本机进度并同步';
    const cloud = document.createElement('button'); cloud.textContent = '使用云端进度';
    const later = document.createElement('button'); later.textContent = '稍后处理';
    dialog.append(title,message,local,cloud,later); document.body.append(dialog); this.conflictDialog=dialog;
    const close=()=>{dialog.close();dialog.remove();this.conflictDialog=null;};
    later.onclick=close;
    for (const [button,choice] of [[local,'local'],[cloud,'cloud']]) button.onclick=async()=>{
      try {
        const book=this.current;
        await this.store.resolveConflict(book,choice);
        close();
        if (choice==='cloud') {
          this.restoring=true; this.view.restorePosition(book.position); this.view.updateProgress(book.progress);
          await new Promise(resolve=>requestAnimationFrame(resolve)); this.restoring=false;
          this.unsaved.delete(book.id); this.renderShelf(); this.reportSaveState();
        } else await this.persist();
      } catch(error) { message.textContent=error.message || '处理失败，请重试。'; }
    };
    dialog.showModal();
  }
  async deleteBook(id) {
    const book = this.books.find(item => item.id === id);
    if (!book || !confirm(`删除《${book.title}》？${this.cloudMode ? '云端正文和阅读位置将被移除。' : '正文和阅读位置将从此浏览器移除。'}原 TXT 文件仍保留。`)) return;
    await this.flush();
    this.pendingDelete = id;
    try { await this.finishDelete(id); }
    catch { this.view.message('删除失败，书籍仍保留，请重试保存或稍后再试。', true); document.getElementById('retry-save').hidden = false; }
  }
  async finishDelete(id) {
    await this.store.remove(id, this.current?.id === id ? null : this.current?.id);
    this.books = this.books.filter(item => item.id !== id);
    this.unsaved.delete(id);
    if (this.current?.id === id) { this.current = null; this.clearAi(); this.view.showBook(null); }
    this.pendingDelete = null;
    this.renderShelf();
    if (this.unsaved.size) this.reportSaveState();
    else { document.getElementById('retry-save').hidden = true; this.view.message('书籍已从书架删除'); }
  }
  clearAi() {
    this.aiController?.abort();
    this.aiController = null;
    this.aiSelected = null;
    this.aiCurrentSelection = null;
    this.resetConversation();
    document.getElementById('ai-spoilers').checked = false;
    document.getElementById('ai-panel').hidden = true;
    document.getElementById('ai-selection-wrap').hidden = true;
    document.getElementById('ai-selection').textContent = '';
    document.getElementById('ai-answer').textContent = '选择一段文字，开始阅读。';
    document.getElementById('ai-retry').hidden = true;
    window.getSelection()?.removeAllRanges();
  }
  resetConversation() {
    this.aiHistory = [];
    this.aiPendingQuestion = '';
    document.getElementById('ai-chat').replaceChildren();
    document.getElementById('ai-question').value = '';
    document.getElementById('ai-question').disabled = true;
    document.getElementById('ai-send').disabled = true;
  }
  addChat(role, text) {
    const item = document.createElement('p'); item.className = 'ai-chat-message';
    const label = document.createElement('strong'); label.textContent = role === 'user' ? '你' : 'AI';
    item.append(label, document.createTextNode(text));
    document.getElementById('ai-chat').append(item);
    item.scrollIntoView({block:'nearest'});
  }
  async requestExplanation(text, question = '') {
    this.aiController?.abort();
    const controller = new AbortController();
    this.aiController = controller;
    const answer = document.getElementById('ai-answer');
    const retry = document.getElementById('ai-retry');
    retry.hidden = true;
    this.aiPendingQuestion = question;
    if (!question) answer.textContent = '正在请求 DeepSeek 解释…';
    document.getElementById('ai-send').disabled = true;
    document.getElementById('ai-question').disabled = true;
    try {
      const allowSpoilers = document.getElementById('ai-spoilers').checked;
      const context = buildContext(fullText(this.current), this.aiCurrentSelection, null, allowSpoilers);
      const history = [...this.aiHistory, ...(question ? [{role:'user', content:question}] : [])].slice(-12);
      const response = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DeepSeek-Key': this.aiApiKey || '' }, body: JSON.stringify({text, context, title:this.current.title, history, allowSpoilers}), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `请求失败（HTTP ${response.status}）。`);
      if (this.aiController === controller) {
        if (question) { this.addChat('user', question); this.addChat('assistant', result.answer); }
        else answer.textContent = result.answer;
        this.aiHistory = [...history, {role:'assistant', content:result.answer}].slice(-11);
        this.aiPendingQuestion = '';
        document.getElementById('ai-question').disabled = false;
        document.getElementById('ai-send').disabled = false;
      }
    } catch (error) {
      if (controller.signal.aborted || this.aiController !== controller) return;
      const message = error.message === 'Failed to fetch' ? '无法连接本机服务，请检查服务是否运行。' : `请求失败：${error.message}`;
      if (question) this.addChat('assistant', message); else answer.textContent = message;
      retry.hidden = false;
    } finally {
      if (this.aiController === controller) this.aiController = null;
    }
  }
}
