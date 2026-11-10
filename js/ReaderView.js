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
  message(text, error = false) {
    this.status.textContent = text;
    this.status.classList.toggle('error', error);
  }
  updateProgress(value, hasBook = true) {
    document.getElementById('progress-label').textContent = hasBook ? `阅读进度 ${Math.round(value)}%` : '尚未打开书籍';
    document.getElementById('progress-bar').style.width = `${value}%`;
  }
}
