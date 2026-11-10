export class ReaderView {
  constructor() {
    for (const id of ['reader', 'content', 'welcome', 'library', 'status']) this[id] = document.getElementById(id);
  }
  showBook(book) {
    this.content.replaceChildren();
    this.content.hidden = !book;
    this.welcome.hidden = Boolean(book);
    document.getElementById('book-title').textContent = book?.title || '把世界调慢一页。';
    document.getElementById('toolbar-title').textContent = book?.title || '开始阅读';
    document.getElementById('book-meta').textContent = book ? `${book.encoding.toUpperCase()} · ${book.paragraphs.join('\n').length.toLocaleString()} 字符` : '一本书，一段安静的时光。';
    if (book) {
      const fragment = document.createDocumentFragment();
      for (const text of book.paragraphs) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text || '\u200b';
        fragment.append(paragraph);
      }
      this.content.append(fragment);
    }
    this.reader.scrollTop = 0;
    this.updateProgress(0, Boolean(book));
  }
  renderLibrary(books, currentId) {
    document.getElementById('book-count').textContent = `${books.length} 本`;
    this.library.replaceChildren();
    if (!books.length) {
      const text = document.createElement('p');
      text.className = 'shelf-empty';
      text.textContent = '书架还是空的。导入一本书，从这一页开始。';
      this.library.append(text);
    }
    const format = time => new Date(time).toLocaleString('zh-CN');
    for (const book of [...books].sort((a, b) => (b.lastReadAt || b.importedAt) - (a.lastReadAt || a.importedAt))) {
      const card = document.createElement('section');
      card.className = `book-card${book.id === currentId ? ' active' : ''}`;
      const open = document.createElement('button');
      open.className = 'open-book';
      open.textContent = book.title;
      open.dataset.open = book.id;
      if (book.id === currentId) open.setAttribute('aria-current', 'true');
      const imported = document.createElement('small');
      imported.textContent = `导入 ${format(book.importedAt)}`;
      const recent = document.createElement('small');
      recent.textContent = book.lastReadAt ? `阅读 ${format(book.lastReadAt)}` : '尚未阅读';
      const bottom = document.createElement('div');
      bottom.className = 'card-bottom';
      const progress = document.createElement('span');
      progress.textContent = `${Math.round(book.progress)}% 已读`;
      const remove = document.createElement('button');
      remove.className = 'delete-book';
      remove.textContent = '删除';
      remove.setAttribute('aria-label', `删除《${book.title}》`);
      remove.dataset.remove = book.id;
      bottom.append(progress, remove);
      card.append(open, imported, recent, bottom);
      this.library.append(card);
    }
  }
  capturePosition() {
    const children = this.content.children;
    if (!children.length) return { position: { index: 0, ratio: 0 }, progress: 0 };
    const top = this.reader.scrollTop;
    let low = 0, high = children.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (children[mid].offsetTop <= top) low = mid;
      else high = mid - 1;
    }
    const paragraph = children[low];
    const max = this.reader.scrollHeight - this.reader.clientHeight;
    return { position: { index: low, ratio: Math.max(0, Math.min(1, (top - paragraph.offsetTop) / paragraph.offsetHeight)) }, progress: max > 0 ? Math.min(100, top / max * 100) : 100 };
  }
  restorePosition(position) {
    const paragraph = this.content.children[position.index];
    if (paragraph) this.reader.scrollTop = paragraph.offsetTop + paragraph.offsetHeight * position.ratio;
  }
  busy(value) {
    for (const element of document.querySelectorAll('#import-button, #welcome-import, #encoding, .open-book, .delete-book, #retry-save')) element.disabled = value;
  }
  message(text, error = false) {
    this.status.textContent = text;
    this.status.classList.toggle('error', error);
  }
  updateProgress(value, hasBook = true) {
    document.getElementById('progress-label').textContent = hasBook ? `阅读进度 ${Math.round(value)}%` : '尚未打开书籍';
    document.getElementById('progress-bar').style.width = `${value}%`;
  }
}
