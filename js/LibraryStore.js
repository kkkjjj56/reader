import { Book } from './Book.js';

// 数据库操作集中在这里，其他对象只调用保存、读取和删除方法。
export class LibraryStore {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('one-page-reader', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('books', { keyPath: 'id' });
        request.result.createObjectStore('meta');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他阅读器标签页后重试。'));
    });
    this.db.onversionchange = () => this.db.close();
  }
  transaction(action) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['books', 'meta'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('保存被中断'));
      action(tx);
    });
  }
  async read(store, key) {
    return new Promise((resolve, reject) => {
      const request = key === undefined ? this.db.transaction(store).objectStore(store).getAll() : this.db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async load() {
    const [records, lastId] = await Promise.all([this.read('books'), this.read('meta', 'lastId')]);
    return { books: records.map(record => new Book(record)), lastId };
  }
  save(book) {
    return this.transaction(tx => {
      tx.objectStore('books').put(structuredClone(book));
      tx.objectStore('meta').put(book.id, 'lastId');
    });
  }
  remove(id, currentId) {
    return this.transaction(tx => {
      tx.objectStore('books').delete(id);
      tx.objectStore('meta').put(currentId || null, 'lastId');
    });
  }
}
